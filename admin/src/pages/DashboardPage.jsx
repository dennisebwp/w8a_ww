function countUpcomingAppointments(patients) {
  const now = Date.now()
  return patients.reduce((count, patient) => {
    return (
      count +
      (patient.appointments || []).filter((appointment) => {
        const appointmentDate = new Date(appointment.scheduled_for || '').getTime()
        return appointment.status === 'scheduled' && appointmentDate >= now
      }).length
    )
  }, 0)
}

function getLastDietVersion(patient) {
  return (patient.diets || [])
    .map((diet) => Number(diet.meals?.version || 0))
    .sort((left, right) => right - left)[0]
}

export default function DashboardPage({ patients, selectedPatient, onNavigate }) {
  const totals = {
    patients: patients.length,
    diets: patients.reduce((count, patient) => count + (patient.diets || []).length, 0),
    consultations: patients.reduce((count, patient) => count + (patient.consultations || []).length, 0),
    appointments: countUpcomingAppointments(patients),
  }

  const recentPatients = [...patients].slice(0, 5)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Centro de control</p>
          <h2>Operación nutricional semanal</h2>
          <p className="brand-copy">
            Desde aquí puedes revisar pacientes, iniciar una consulta, construir planes
            nutricionales y enviar la dieta final por WhatsApp.
          </p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={() => onNavigate('patients')}>
            Ver pacientes
          </button>
          <button className="secondary-button" onClick={() => onNavigate('planner')}>
            Abrir planificador
          </button>
          <button className="secondary-button" onClick={() => onNavigate('flow')}>
            Flujo del bot
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Pacientes</span>
          <strong>{totals.patients}</strong>
        </article>
        <article className="stat-card">
          <span>Dietas creadas</span>
          <strong>{totals.diets}</strong>
        </article>
        <article className="stat-card">
          <span>Consultas registradas</span>
          <strong>{totals.consultations}</strong>
        </article>
        <article className="stat-card">
          <span>Próximas citas</span>
          <strong>{totals.appointments}</strong>
        </article>
      </section>

      <section className="grid two-column">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Paciente activo</p>
              <h3>{selectedPatient?.full_name || 'Sin selección'}</h3>
            </div>
            {selectedPatient && (
              <button className="secondary-button" onClick={() => onNavigate('planner')}>
                Iniciar consulta
              </button>
            )}
          </div>

          {selectedPatient ? (
            <div className="meta-grid">
              <div className="metric-card">
                <span>WhatsApp</span>
                <strong>{selectedPatient.whatsapp_number}</strong>
              </div>
              <div className="metric-card">
                <span>Estado</span>
                <strong>{selectedPatient.status || 'activo'}</strong>
              </div>
              <div className="metric-card">
                <span>Dieta actual</span>
                <strong>v{getLastDietVersion(selectedPatient) || 0}</strong>
              </div>
              <div className="metric-card">
                <span>Consultas</span>
                <strong>{selectedPatient.consultations?.length || 0}</strong>
              </div>
            </div>
          ) : (
            <p className="empty-copy">Selecciona un paciente para revisar su contexto clínico.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Actividad reciente</p>
              <h3>Pacientes recientes</h3>
            </div>
          </div>

          <div className="collection">
            {recentPatients.map((patient) => (
              <div key={patient.id} className="collection-card">
                <strong>{patient.full_name || 'Paciente sin nombre'}</strong>
                <p>{patient.whatsapp_number}</p>
                <span>
                  Dietas: {patient.diets?.length || 0} | Consultas: {patient.consultations?.length || 0}
                </span>
              </div>
            ))}
            {!recentPatients.length && <p className="empty-copy">Aún no hay pacientes registrados.</p>}
          </div>
        </article>
      </section>
    </div>
  )
}
