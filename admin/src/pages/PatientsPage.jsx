function formatProfileEntries(profile = {}) {
  return Object.entries(profile).map(([key, value]) => ({
    key,
    label: key.replace(/_/g, ' '),
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
  }))
}

function sortByDateDescending(items = [], field) {
  return [...items].sort((left, right) => new Date(right[field] || 0) - new Date(left[field] || 0))
}

export default function PatientsPage({
  selectedPatient,
  appointmentForm,
  progressForm,
  onAppointmentChange,
  onProgressChange,
  onCreateAppointment,
  onCreateProgress,
  onNavigateToPlanner,
  onSendLatestDiet,
}) {
  const profileEntries = selectedPatient ? formatProfileEntries(selectedPatient.latest_profile) : []
  const diets = sortByDateDescending(selectedPatient?.diets, 'created_at')
  const consultations = sortByDateDescending(selectedPatient?.consultations, 'created_at')
  const appointments = sortByDateDescending(selectedPatient?.appointments, 'scheduled_for')
  const progressLogs = sortByDateDescending(selectedPatient?.progress_logs, 'recorded_at')

  if (!selectedPatient) {
    return (
      <section className="panel empty-state">
        <h2>Pacientes</h2>
        <p className="empty-copy">Selecciona un paciente desde la barra lateral para ver su historial.</p>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Ficha del paciente</p>
            <h2>{selectedPatient.full_name || 'Paciente sin nombre'}</h2>
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={onNavigateToPlanner}>
              Crear dieta semanal
            </button>
            <button className="secondary-button" onClick={onSendLatestDiet}>
              Enviar última dieta
            </button>
          </div>
        </div>

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
            <span>Dietas</span>
            <strong>{diets.length}</strong>
          </div>
          <div className="metric-card">
            <span>Consultas</span>
            <strong>{consultations.length}</strong>
          </div>
        </div>
      </section>

      <section className="grid two-column">
        <article className="panel">
          <h3>Datos capturados por WhatsApp</h3>
          <div className="profile-list">
            {profileEntries.map((entry) => (
              <div key={entry.key} className="profile-row">
                <span>{entry.label}</span>
                <p>{entry.value || 'Sin valor'}</p>
              </div>
            ))}
            {!profileEntries.length && <p className="empty-copy">No hay datos de formulario todavía.</p>}
          </div>
        </article>

        <article className="panel">
          <h3>Historial clínico</h3>
          <div className="collection">
            {consultations.map((consultation) => (
              <div key={consultation.id} className="collection-card">
                <strong>{consultation.summary || 'Consulta sin resumen'}</strong>
                <p>{consultation.notes || 'Sin notas registradas.'}</p>
                <span>{new Date(consultation.created_at).toLocaleString()}</span>
              </div>
            ))}
            {!consultations.length && <p className="empty-copy">Todavía no hay consultas guardadas.</p>}
          </div>
        </article>
      </section>

      <section className="grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h3>Versiones de dieta</h3>
            <button className="secondary-button" onClick={onNavigateToPlanner}>
              Nueva versión
            </button>
          </div>
          <div className="collection">
            {diets.map((diet) => (
              <div key={diet.id} className="collection-card">
                <strong>{diet.title}</strong>
                <p>{diet.summary || 'Sin resumen'}</p>
                <span>
                  v{diet.meals?.version || 0} | {diet.starts_on || 'Sin inicio'} a {diet.ends_on || 'Sin fin'}
                </span>
              </div>
            ))}
            {!diets.length && <p className="empty-copy">Aún no hay dietas guardadas.</p>}
          </div>
        </article>

        <article className="panel">
          <h3>Citas y progreso</h3>
          <div className="collection split">
            <div>
              <h4>Citas</h4>
              {(appointments || []).map((appointment) => (
                <div key={appointment.id} className="collection-card">
                  <strong>{appointment.status}</strong>
                  <p>{new Date(appointment.scheduled_for).toLocaleString()}</p>
                  <span>{appointment.location || 'Sin ubicación'}</span>
                </div>
              ))}
              {!appointments.length && <p className="empty-copy">No hay citas registradas.</p>}
            </div>
            <div>
              <h4>Progreso</h4>
              {(progressLogs || []).map((log) => (
                <div key={log.id} className="collection-card">
                  <strong>{new Date(log.recorded_at).toLocaleString()}</strong>
                  <p>
                    Peso {log.weight || 'N/D'} kg | % grasa {log.body_fat_percentage || 'N/D'} | Cintura{' '}
                    {log.waist_cm || 'N/D'} cm
                  </p>
                  <span>{log.notes || 'Sin notas'}</span>
                </div>
              ))}
              {!progressLogs.length && <p className="empty-copy">No hay logs de progreso.</p>}
            </div>
          </div>
        </article>
      </section>

      <section className="grid two-column">
        <article className="panel">
          <h3>Registrar cita</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              onCreateAppointment()
            }}
          >
            <label>
              Fecha y hora
              <input
                type="datetime-local"
                value={appointmentForm.scheduled_for}
                onChange={(event) => onAppointmentChange('scheduled_for', event.target.value)}
                required
              />
            </label>
            <label>
              Estado
              <select value={appointmentForm.status} onChange={(event) => onAppointmentChange('status', event.target.value)}>
                <option value="scheduled">programada</option>
                <option value="completed">completada</option>
                <option value="cancelled">cancelada</option>
              </select>
            </label>
            <label>
              Lugar
              <input value={appointmentForm.location} onChange={(event) => onAppointmentChange('location', event.target.value)} />
            </label>
            <label>
              Notas
              <textarea rows="4" value={appointmentForm.notes} onChange={(event) => onAppointmentChange('notes', event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              Guardar cita
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Registrar progreso</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              onCreateProgress()
            }}
          >
            <label>
              Fecha de registro
              <input
                type="datetime-local"
                value={progressForm.recorded_at}
                onChange={(event) => onProgressChange('recorded_at', event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Peso (kg)
                <input type="number" step="0.01" value={progressForm.weight} onChange={(event) => onProgressChange('weight', event.target.value)} />
              </label>
              <label>
                % grasa corporal
                <input
                  type="number"
                  step="0.01"
                  value={progressForm.body_fat_percentage}
                  onChange={(event) => onProgressChange('body_fat_percentage', event.target.value)}
                />
              </label>
            </div>
            <label>
              Cintura (cm)
              <input type="number" step="0.01" value={progressForm.waist_cm} onChange={(event) => onProgressChange('waist_cm', event.target.value)} />
            </label>
            <label>
              Notas
              <textarea rows="4" value={progressForm.notes} onChange={(event) => onProgressChange('notes', event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              Guardar progreso
            </button>
          </form>
        </article>
      </section>
    </div>
  )
}
