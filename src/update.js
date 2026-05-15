const { updatePatientField } = require('./services/patientService');

function formatQuestionLabel(question) {
    return question.prompt.replace(/\*/g, '');
}

function displayUpdateOptions(client, from, patient, questions) {
    const profile = patient.latest_profile || {};
    const options = questions
        .map((question, index) => `${index + 1}. ${formatQuestionLabel(question)}\nActual: ${profile[question.fieldKey] || 'Sin dato'}`)
        .join('\n\n');

    client.sendMessage(from, `📝 *Datos actuales*\n\n${options}\n\nEscribe el número del campo que deseas actualizar.`);
}

async function handleUpdate(client, message, userSession) {
    const from = message.from;
    const body = message.body.trim();
    const normalized = body.toLowerCase();
    const state = userSession[from];

    if (!state || state.mode !== 'update') {
        return false;
    }

    if (normalized === 'done' || normalized === 'finish' || normalized === 'terminar') {
        delete userSession[from];
        client.sendMessage(from, 'Has salido del modo de actualización.');
        return 'finished';
    }

    if (normalized === 'back' || normalized === 'atras' || normalized === 'atrás') {
        if (state.awaitingNewValue) {
            state.selectedQuestion = null;
            state.awaitingNewValue = false;
            state.awaitingFieldSelection = true;
            client.sendMessage(from, 'Volviste a la lista de campos.');
            displayUpdateOptions(client, from, state.patient, state.questions);
            return true;
        }

        client.sendMessage(from, 'Ya estás en la lista principal de actualización.');
        displayUpdateOptions(client, from, state.patient, state.questions);
        return true;
    }

    if (state.awaitingFieldSelection) {
        const selectedIndex = Number(body);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > state.questions.length) {
            client.sendMessage(from, 'Selección inválida. Elige un número de la lista.');
            displayUpdateOptions(client, from, state.patient, state.questions);
            return true;
        }

        const selectedQuestion = state.questions[selectedIndex - 1];
        state.selectedQuestion = selectedQuestion;
        state.awaitingFieldSelection = false;
        state.awaitingNewValue = true;

        client.sendMessage(from, `Escribe el nuevo valor para:\n\n${selectedQuestion.prompt}`);
        return true;
    }

    if (state.awaitingNewValue) {
        try {
            const updatedPatient = await updatePatientField(from, state.selectedQuestion.fieldKey, message.body.trim());
            state.patient = updatedPatient;
            state.awaitingFieldSelection = true;
            state.awaitingNewValue = false;
            state.selectedQuestion = null;

            client.sendMessage(from, 'Dato actualizado correctamente.');
            displayUpdateOptions(client, from, state.patient, state.questions);
        } catch (error) {
            console.error('Error updating patient profile:', error.message);
            client.sendMessage(from, 'No pude actualizar el dato en este momento.');
        }

        return true;
    }

    return false;
}

module.exports = {
    displayUpdateOptions,
    handleUpdate,
};
