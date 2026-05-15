export default function FlowPage({ questionFlow, onPatchQuestion, onSaveFlow }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Automatización</p>
          <h2>Flujo del bot de WhatsApp</h2>
        </div>
        <button className="primary-button" onClick={onSaveFlow}>
          Guardar flujo
        </button>
      </div>

      <div className="flow-grid">
        {questionFlow.map((question, index) => (
          <article key={question.id} className="flow-card">
            <div className="flow-header">
              <strong>{question.id}</strong>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={question.isActive !== false}
                  onChange={(event) => onPatchQuestion(index, 'isActive', event.target.checked)}
                />
                Activa
              </label>
            </div>
            <div className="form-grid">
              <label>
                Orden
                <input
                  type="number"
                  value={question.sortOrder}
                  onChange={(event) => onPatchQuestion(index, 'sortOrder', event.target.value)}
                />
              </label>
              <label>
                Tipo de entrada
                <input
                  value={question.inputType}
                  onChange={(event) => onPatchQuestion(index, 'inputType', event.target.value)}
                />
              </label>
            </div>
            <label>
              Prompt
              <textarea
                rows="3"
                value={question.prompt}
                onChange={(event) => onPatchQuestion(index, 'prompt', event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Campo destino
                <input
                  value={question.fieldKey}
                  onChange={(event) => onPatchQuestion(index, 'fieldKey', event.target.value)}
                />
              </label>
              <label>
                Siguiente pregunta
                <input
                  value={question.nextQuestionId || ''}
                  onChange={(event) => onPatchQuestion(index, 'nextQuestionId', event.target.value)}
                />
              </label>
            </div>
            <label>
              Validación JSON
              <textarea
                rows="6"
                value={question.validationText || '{}'}
                onChange={(event) => onPatchQuestion(index, 'validationText', event.target.value)}
              />
            </label>
            <label>
              Branch map JSON
              <textarea
                rows="6"
                value={question.branchMapText || '{}'}
                onChange={(event) => onPatchQuestion(index, 'branchMapText', event.target.value)}
              />
            </label>
          </article>
        ))}
      </div>
    </section>
  )
}
