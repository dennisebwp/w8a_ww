export default function LoginPage({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  authLoading,
  error,
  supabaseConfigReady,
}) {
  return (
    <div className="app-shell single-column">
      <main className="content auth-layout">
        <section className="panel auth-panel">
          <p className="eyebrow">Acceso administrativo</p>
          <h1>W8A Nutrición</h1>
          <p className="brand-copy">
            Inicia sesión con tu cuenta de Supabase. Los pacientes no entran aquí; este panel es
            solo para la nutricionista y su operación.
          </p>

          <form className="stack" onSubmit={onSubmit}>
            <label>
              Correo
              <input value={email} onChange={(event) => onEmailChange(event.target.value)} type="email" required />
            </label>
            <label>
              Contraseña
              <input
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                type="password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={authLoading}>
              {authLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {!supabaseConfigReady && (
            <p className="status error">
              Falta `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLISHABLE_KEY`. Reinicia `npm run dev:admin`
              después de corregir el `.env`.
            </p>
          )}
          {error && <p className="status error">{error}</p>}
        </section>
      </main>
    </div>
  )
}
