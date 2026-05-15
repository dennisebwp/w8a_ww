// Function to send the main menu options
function sendMainMenu(client, from) {
    client.sendMessage(from, `
👋 *¡Bienvenid@ a W8A Training and Nutrition!* 💪

Estamos aquí para ayudarte a alcanzar tus metas de *fitness* y *nutrición*.

🔹 *Este formulario es dinámico y guarda tu historial.*
🔹 Si eres un **usuario nuevo**, usa *start* para registrarte.
🔹 Si deseas **actualizar tus datos**, usa *update*.
🔹 Si dejaste un formulario incompleto, usa *continue* para retomarlo.

*Comandos disponibles:*
👉 *start* - Iniciar el formulario
👉 *continue* - Retomar un formulario pendiente
👉 *update* - Actualizar tus datos
👉 *planes* - Ver los planes de entrenamiento y nutrición
👉 *status* - Ver tu estado actual
👉 *menu* o *help* - Ver comandos disponibles
👉 *back* - Volver a la pregunta anterior
👉 *salir* - Cancelar el flujo actual
`);
}

function sendNavigationHelp(client, from, mode) {
    const modeLabel = mode === 'update' ? 'actualización' : 'formulario';

    client.sendMessage(from, `
🧭 *Navegación del ${modeLabel}*

👉 *back* - Volver al paso anterior
👉 *status* - Ver en qué punto vas
👉 *menu* o *help* - Ver el menú principal
👉 *salir* - Cancelar el flujo actual
${mode === 'update' ? '👉 *done* - Salir del modo de actualización\n' : ''}`.trim());
}

function sendStatusMessage(client, from, message) {
    client.sendMessage(from, `📍 *Estado actual*\n\n${message}`);
}

// Function to display information about available plans
function sendPlanInfo(client, from) {
    client.sendMessage(from, `
📋 *Planes de Entrenamiento y Nutrición:*

🟢 **PLAN 1**:
- Asesoría en alimentación (4 dietas por trimestre, cambiando plan cada 3/4 semanas).
- Asesoría en suplementos (mensual).
- Plan de entreno (cada mes).
- *Precio:* $250 por 3 meses

🟢 **PLAN 2**:
- Asesoría en alimentación (6 dietas por trimestre, cambiando plan cada 15 días).
- Asesoría en suplementos de todo tipo (mensual).
- Plan de entreno (cada mes).
- *Precio:* $300 por 3 meses

🟢 **PLAN 3**:
- Asesoría en alimentación (cambio y/o ajustes en el plan alimentario cada semana).
- Asesoría en suplementos (mensualmente o de acuerdo a la necesidad).
- Plan de entreno (cada mes).
- *Precio:* $400 por 3 meses

Para más información o para iniciar tu plan, contáctanos.
`);
}

module.exports = {
    sendMainMenu,
    sendPlanInfo,
    sendNavigationHelp,
    sendStatusMessage,
};
