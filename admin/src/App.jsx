import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from './lib/supabase'
import { getApiBaseUrl, parseJsonInput, request } from './lib/api'
import DashboardPage from './pages/DashboardPage'
import FlowPage from './pages/FlowPage'
import LoginPage from './pages/LoginPage'
import PatientsPage from './pages/PatientsPage'
import PlannerPage from './pages/PlannerPage'

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

const PAGE_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'patients', label: 'Pacientes' },
  { id: 'planner', label: 'Planificador semanal' },
  { id: 'flow', label: 'Flujo del bot' },
]

const emptyAppointment = {
  scheduled_for: '',
  status: 'scheduled',
  location: '',
  notes: '',
}

const emptyProgress = {
  recorded_at: '',
  weight: '',
  body_fat_percentage: '',
  waist_cm: '',
  notes: '',
}

function getPageFromHash() {
  const hash = window.location.hash.replace('#', '')
  return PAGE_OPTIONS.some((page) => page.id === hash) ? hash : 'dashboard'
}

function normalizeQuestionFlow(flowResponse = []) {
  return flowResponse.map((question) => ({
    ...question,
    validationText: JSON.stringify(question.validation || {}, null, 2),
    branchMapText: JSON.stringify(question.branchMap || {}, null, 2),
  }))
}

function sortPatients(patients) {
  return [...patients].sort((left, right) => new Date(right.updated_at || 0) - new Date(left.updated_at || 0))
}

function App() {
  const [page, setPage] = useState(getPageFromHash)
  const [session, setSession] = useState(null)
  const [adminProfile, setAdminProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [patients, setPatients] = useState([])
  const [questionFlow, setQuestionFlow] = useState([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [appointmentForm, setAppointmentForm] = useState(emptyAppointment)
  const [progressForm, setProgressForm] = useState(emptyProgress)
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const normalizedApiBaseUrl = getApiBaseUrl()
  const accessToken = session?.access_token || ''
  const supabaseConfigReady = Boolean(DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(
    () => createBrowserSupabaseClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY),
    [],
  )

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) || null,
    [patients, selectedPatientId],
  )

  useEffect(() => {
    function handleHashChange() {
      setPage(getPageFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      if (!supabase) {
        setSession(null)
        setAuthLoading(false)
        return
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!mounted) {
        return
      }

      if (sessionError) {
        setError(sessionError.message)
      }

      setSession(data.session ?? null)
      setAuthLoading(false)
    }

    loadSession()

    if (!supabase) {
      return () => {
        mounted = false
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!accessToken) {
      setAdminProfile(null)
      setPatients([])
      setQuestionFlow([])
      return
    }

    loadDashboard()
  }, [accessToken])

  async function loadDashboard() {
    if (!accessToken) {
      setError('Inicia sesión primero.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const [meResponse, patientsResponse, flowResponse] = await Promise.all([
        request(normalizedApiBaseUrl, accessToken, '/api/admin/me'),
        request(normalizedApiBaseUrl, accessToken, '/api/admin/patients'),
        request(normalizedApiBaseUrl, accessToken, '/api/admin/question-flow'),
      ])

      const sortedPatients = sortPatients(patientsResponse)

      setAdminProfile(meResponse)
      setPatients(sortedPatients)
      setQuestionFlow(normalizeQuestionFlow(flowResponse))

      if (!selectedPatientId && sortedPatients.length) {
        setSelectedPatientId(sortedPatients[0].id)
      } else if (selectedPatientId && !sortedPatients.some((patient) => patient.id === selectedPatientId)) {
        setSelectedPatientId(sortedPatients[0]?.id || '')
      }

      setStatusMessage('Panel actualizado.')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    setError('')
    setStatusMessage('')
    setAuthLoading(true)

    if (!supabaseConfigReady || !supabase) {
      setAuthLoading(false)
      setError('Falta configuración de Supabase para el admin.')
      return
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setAuthLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    setSession(data.session)
    setPassword('')
    setStatusMessage('Sesión iniciada.')
  }

  async function signOut() {
    setError('')
    setStatusMessage('')
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setSession(null)
    setAdminProfile(null)
    setPatients([])
    setQuestionFlow([])
    setSelectedPatientId('')
    setStatusMessage('Sesión cerrada.')
  }

  async function submitPatientAction(path, payload, successMessage) {
    if (!selectedPatientId) {
      setError('Selecciona un paciente primero.')
      return null
    }

    setError('')
    setStatusMessage('')

    try {
      const response = await request(normalizedApiBaseUrl, accessToken, path, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      await loadDashboard()
      setStatusMessage(successMessage)
      return response
    } catch (submitError) {
      setError(submitError.message)
      return null
    }
  }

  async function saveQuestionFlowChanges() {
    setError('')
    setStatusMessage('')

    try {
      const payload = questionFlow.map((question) => ({
        ...question,
        sortOrder: Number(question.sortOrder),
        validation: parseJsonInput(question.validationText, `Validación de ${question.id}`),
        branchMap: parseJsonInput(question.branchMapText, `Branch map de ${question.id}`),
        nextQuestionId: question.nextQuestionId || null,
      }))

      const response = await request(normalizedApiBaseUrl, accessToken, '/api/admin/question-flow', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      setQuestionFlow(normalizeQuestionFlow(response))
      setStatusMessage('Flujo del bot actualizado.')
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  function patchQuestion(index, field, value) {
    setQuestionFlow((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      ),
    )
  }

  function navigate(nextPage) {
    window.location.hash = nextPage
  }

  async function handleCreateAppointment() {
    await submitPatientAction(
      `/api/admin/patients/${selectedPatientId}/appointments`,
      appointmentForm,
      'Cita guardada.',
    )
    setAppointmentForm(emptyAppointment)
  }

  async function handleCreateProgress() {
    await submitPatientAction(
      `/api/admin/patients/${selectedPatientId}/progress-logs`,
      {
        ...progressForm,
        weight: progressForm.weight ? Number(progressForm.weight) : null,
        body_fat_percentage: progressForm.body_fat_percentage ? Number(progressForm.body_fat_percentage) : null,
        waist_cm: progressForm.waist_cm ? Number(progressForm.waist_cm) : null,
        recorded_at: progressForm.recorded_at || null,
      },
      'Progreso guardado.',
    )
    setProgressForm(emptyProgress)
  }

  async function handleSaveConsultation(payload) {
    await submitPatientAction(
      `/api/admin/patients/${selectedPatientId}/consultations`,
      payload,
      'Consulta guardada.',
    )
  }

  async function handleSaveDiet(payload) {
    await submitPatientAction(
      `/api/admin/patients/${selectedPatientId}/diets`,
      payload,
      'Dieta semanal guardada.',
    )
  }

  async function handleSendLatestDiet() {
    await submitPatientAction(
      `/api/admin/patients/${selectedPatientId}/send-latest-diet`,
      {},
      'Dieta enviada por WhatsApp.',
    )
  }

  async function handleSearchFoods(query) {
    try {
      return await request(
        normalizedApiBaseUrl,
        accessToken,
        `/api/admin/foods/search?q=${encodeURIComponent(query)}`,
      )
    } catch (searchError) {
      setError(searchError.message)
      return []
    }
  }

  function renderPage() {
    if (page === 'patients') {
      return (
        <PatientsPage
          selectedPatient={selectedPatient}
          appointmentForm={appointmentForm}
          progressForm={progressForm}
          onAppointmentChange={(field, value) => setAppointmentForm((current) => ({ ...current, [field]: value }))}
          onProgressChange={(field, value) => setProgressForm((current) => ({ ...current, [field]: value }))}
          onCreateAppointment={handleCreateAppointment}
          onCreateProgress={handleCreateProgress}
          onNavigateToPlanner={() => navigate('planner')}
          onSendLatestDiet={handleSendLatestDiet}
        />
      )
    }

    if (page === 'planner') {
      return (
        <PlannerPage
          selectedPatient={selectedPatient}
          onSaveConsultation={handleSaveConsultation}
          onSaveDiet={handleSaveDiet}
          onSendLatestDiet={handleSendLatestDiet}
          onSearchFoods={handleSearchFoods}
        />
      )
    }

    if (page === 'flow') {
      return (
        <FlowPage questionFlow={questionFlow} onPatchQuestion={patchQuestion} onSaveFlow={saveQuestionFlowChanges} />
      )
    }

    return <DashboardPage patients={patients} selectedPatient={selectedPatient} onNavigate={navigate} />
  }

  if (authLoading && !session) {
    return (
      <div className="app-shell single-column">
        <main className="content">
          <section className="panel">
            <h2>Cargando sesión administrativa...</h2>
          </section>
        </main>
      </div>
    )
  }

  if (!session) {
    return (
      <LoginPage
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={signIn}
        authLoading={authLoading}
        error={error}
        supabaseConfigReady={supabaseConfigReady}
      />
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Nutrición clínica</p>
          <h1>W8A Admin</h1>
          <p className="brand-copy">
            Panel operativo en español para pacientes, consultas, dietas semanales y automatización
            del bot.
          </p>
        </div>

        <div className="panel">
          <h2>Sesión</h2>
          <p>
            <strong>{adminProfile?.user?.full_name || session.user.user_metadata?.full_name || session.user.email}</strong>
          </p>
          <p>{session.user.email}</p>
          <div className="button-row">
            <button className="primary-button" onClick={loadDashboard} disabled={loading}>
              {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
            <button className="secondary-button" onClick={signOut}>
              Salir
            </button>
          </div>
        </div>

        <nav className="panel nav-panel">
          <h2>Secciones</h2>
          <div className="nav-list">
            {PAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={page === option.id ? 'nav-button active' : 'nav-button'}
                onClick={() => navigate(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="panel">
          <div className="panel-header">
            <h2>Pacientes</h2>
            <span>{patients.length}</span>
          </div>
          <div className="patient-list">
            {patients.map((patient) => (
              <button
                key={patient.id}
                className={patient.id === selectedPatientId ? 'patient-chip active' : 'patient-chip'}
                onClick={() => setSelectedPatientId(patient.id)}
              >
                <strong>{patient.full_name || 'Paciente sin nombre'}</strong>
                <span>{patient.whatsapp_number}</span>
              </button>
            ))}
            {!patients.length && <p className="empty-copy">Todavía no hay pacientes cargados.</p>}
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operación diaria</p>
            <h2>{PAGE_OPTIONS.find((option) => option.id === page)?.label || 'Dashboard'}</h2>
            <p className="brand-copy">{selectedPatient?.full_name || 'Selecciona un paciente para trabajar.'}</p>
          </div>
          <div className="status-row">
            {statusMessage && <p className="status success">{statusMessage}</p>}
            {error && <p className="status error">{error}</p>}
          </div>
        </header>

        {renderPage()}
      </main>
    </div>
  )
}

export default App
