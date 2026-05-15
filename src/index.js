const { client, userSession, initializeClient } = require('./whatsappClient');
const { displayUpdateOptions, handleUpdate } = require('./update');
const { sendMainMenu, sendPlanInfo, sendNavigationHelp, sendStatusMessage } = require('./menu');
const { startServer } = require('./server');
const {
    getPatientByWhatsappNumber,
    upsertPatientProfile,
    getBotSession,
    createOrUpdateBotSession,
    completeBotSession,
    cancelBotSession,
} = require('./services/patientService');
const {
    loadQuestions,
    getFirstQuestion,
    getQuestionById,
    validateAnswer,
    resolveNextQuestionId,
} = require('./services/questionFlowService');

const COMMAND_ALIASES = {
    start: 'start',
    iniciar: 'start',
    registro: 'start',
    register: 'start',
    continue: 'continue',
    continuar: 'continue',
    resume: 'continue',
    update: 'update',
    editar: 'update',
    edit: 'update',
    perfil: 'update',
    planes: 'plans',
    plans: 'plans',
    help: 'help',
    ayuda: 'help',
    menu: 'menu',
    inicio: 'menu',
    status: 'status',
    estado: 'status',
    back: 'back',
    atras: 'back',
    'atrás': 'back',
    salir: 'exit',
    cancelar: 'exit',
    cancel: 'exit',
};

function normalizeCommand(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return COMMAND_ALIASES[normalized] || normalized;
}

function stripSessionMeta(answers = {}) {
    const { __meta, ...profileAnswers } = answers || {};
    return profileAnswers;
}

function extractSessionMeta(answers = {}) {
    return answers?.__meta || {};
}

function withSessionMeta(answers, meta) {
    return {
        ...answers,
        __meta: meta,
    };
}

async function getQuestionIndexById(questionId) {
    const questions = await loadQuestions();
    const index = questions.findIndex((question) => question.id === questionId);
    return {
        questions,
        index,
    };
}

async function hydrateSession(from) {
    if (userSession[from]) {
        return userSession[from];
    }

    const persistedSession = await getBotSession(from);
    if (!persistedSession) {
        return null;
    }

    userSession[from] = {
        mode: 'questionnaire',
        sessionId: persistedSession.id,
        currentQuestionId: persistedSession.current_question_id,
        answers: stripSessionMeta(persistedSession.answers || {}),
        history: extractSessionMeta(persistedSession.answers || {}).history || [persistedSession.current_question_id].filter(Boolean),
    };

    return userSession[from];
}

async function startQuestionnaire(from) {
    const firstQuestion = await getFirstQuestion();
    if (!firstQuestion) {
        throw new Error('No question flow configured.');
    }

    const session = await createOrUpdateBotSession(from, firstQuestion.id, {});
    userSession[from] = {
        mode: 'questionnaire',
        sessionId: session.id,
        currentQuestionId: firstQuestion.id,
        answers: {},
        history: [firstQuestion.id],
    };

    await client.sendMessage(from, `¡Hola! Vamos a empezar con tu formulario.\n\n${firstQuestion.prompt}`);
    sendNavigationHelp(client, from, 'questionnaire');
}

async function processQuestionnaireAnswer(message, state) {
    const from = message.from;
    const question = await getQuestionById(state.currentQuestionId);

    if (!question) {
        await client.sendMessage(from, 'No encontré la siguiente pregunta. Escribe *start* para reiniciar el formulario.');
        delete userSession[from];
        return true;
    }

    const validationError = validateAnswer(question, message.body);
    if (validationError) {
        await client.sendMessage(from, `${validationError}\n\n${question.prompt}`);
        return true;
    }

    const nextAnswers = {
        ...state.answers,
        [question.fieldKey]: message.body.trim(),
    };
    const nextQuestionId = resolveNextQuestionId(question, message.body);

    if (nextQuestionId) {
        const nextQuestion = await getQuestionById(nextQuestionId);
        const nextHistory = [...(state.history || [state.currentQuestionId]), nextQuestionId];
        const session = await createOrUpdateBotSession(
            from,
            nextQuestionId,
            withSessionMeta(nextAnswers, { history: nextHistory }),
        );

        userSession[from] = {
            mode: 'questionnaire',
            sessionId: session.id,
            currentQuestionId: nextQuestionId,
            answers: nextAnswers,
            history: nextHistory,
        };

        await client.sendMessage(from, nextQuestion.prompt);
        return true;
    }

    const patient = await upsertPatientProfile(from, nextAnswers);
    await completeBotSession(state.sessionId, patient.id, nextAnswers);

    await client.sendMessage(from, '🎉 ¡Gracias! Tus respuestas han sido registradas correctamente.');
    sendMainMenu(client, from);
    delete userSession[from];
    return true;
}

async function handleQuestionnaireBack(from, state) {
    const history = state.history || [state.currentQuestionId];
    if (history.length <= 1) {
        await client.sendMessage(from, 'Ya estás en la primera pregunta del formulario.');
        const currentQuestion = await getQuestionById(state.currentQuestionId);
        if (currentQuestion) {
            await client.sendMessage(from, currentQuestion.prompt);
        }
        return true;
    }

    const previousQuestionId = history[history.length - 2];
    const previousQuestion = await getQuestionById(previousQuestionId);
    if (!previousQuestion) {
        await client.sendMessage(from, 'No pude volver al paso anterior. Usa *start* para reiniciar.');
        return true;
    }

    const nextAnswers = {
        ...state.answers,
    };
    delete nextAnswers[previousQuestion.fieldKey];

    const nextHistory = history.slice(0, -1);
    await createOrUpdateBotSession(
        from,
        previousQuestionId,
        withSessionMeta(nextAnswers, { history: nextHistory }),
    );

    userSession[from] = {
        ...state,
        currentQuestionId: previousQuestionId,
        answers: nextAnswers,
        history: nextHistory,
    };

    await client.sendMessage(from, 'Volviste a la pregunta anterior.');
    await client.sendMessage(from, previousQuestion.prompt);
    return true;
}

async function sendCurrentStatus(from, state) {
    if (!state) {
        sendStatusMessage(client, from, 'No tienes ningún flujo activo. Usa *start* para registrarte o *update* para editar tu perfil.');
        return;
    }

    if (state.mode === 'update') {
        const stage = state.awaitingNewValue ? 'Esperando el nuevo valor del campo seleccionado.' : 'Esperando que elijas qué campo deseas actualizar.';
        sendStatusMessage(client, from, `Modo: actualización\n${stage}`);
        return;
    }

    const { questions, index } = await getQuestionIndexById(state.currentQuestionId);
    const totalQuestions = questions.length;
    const position = index >= 0 ? index + 1 : '?';
    const currentQuestion = await getQuestionById(state.currentQuestionId);
    const answeredCount = Object.keys(state.answers || {}).length;

    sendStatusMessage(
        client,
        from,
        `Modo: formulario\nPregunta actual: ${position} de ${totalQuestions}\nRespuestas guardadas: ${answeredCount}\n\n${currentQuestion ? currentQuestion.prompt : ''}`.trim(),
    );
}

client.on('message', async (message) => {
    const from = message.from;
    const body = message.body.trim();
    const command = normalizeCommand(body);

    try {
        if (command === 'exit') {
            const activeState = await hydrateSession(from);
            if (activeState && activeState.sessionId) {
                await cancelBotSession(activeState.sessionId);
            }

            if (userSession[from]) {
                delete userSession[from];
            }

            await client.sendMessage(from, 'Has salido del flujo actual. Volviendo al menú principal.');
            sendMainMenu(client, from);
            return;
        }

        if (command === 'plans') {
            sendPlanInfo(client, from);
            return;
        }

        if (command === 'menu') {
            sendMainMenu(client, from);
            return;
        }

        if (command === 'help') {
            const activeState = await hydrateSession(from);
            if (activeState) {
                sendNavigationHelp(client, from, activeState.mode);
                return;
            }

            sendMainMenu(client, from);
            return;
        }

        if (command === 'status') {
            const activeState = await hydrateSession(from);
            await sendCurrentStatus(from, activeState || userSession[from] || null);
            return;
        }

        if (command === 'update') {
            const patient = await getPatientByWhatsappNumber(from);
            if (!patient) {
                await client.sendMessage(from, 'No se encontró un perfil previo. Escribe *start* para registrarte.');
                return;
            }

            const questions = await loadQuestions();
            userSession[from] = {
                mode: 'update',
                patient,
                questions,
                awaitingFieldSelection: true,
                awaitingNewValue: false,
                selectedQuestion: null,
            };

            displayUpdateOptions(client, from, patient, questions);
            sendNavigationHelp(client, from, 'update');
            return;
        }

        const updateHandled = await handleUpdate(client, message, userSession);
        if (updateHandled === 'finished') {
            sendMainMenu(client, from);
            return;
        }

        if (updateHandled === true) {
            return;
        }

        if (command === 'start') {
            await startQuestionnaire(from);
            return;
        }

        const activeState = await hydrateSession(from);
        if (command === 'continue') {
            if (!activeState) {
                await client.sendMessage(from, 'No tienes un formulario pendiente. Usa *start* para comenzar uno nuevo.');
                return;
            }

            if (activeState.mode === 'questionnaire') {
                const currentQuestion = await getQuestionById(activeState.currentQuestionId);
                await client.sendMessage(from, 'Retomando tu formulario pendiente.');
                if (currentQuestion) {
                    await client.sendMessage(from, currentQuestion.prompt);
                }
                return;
            }
        }

        if (command === 'back' && activeState && activeState.mode === 'questionnaire') {
            await handleQuestionnaireBack(from, activeState);
            return;
        }

        if (activeState && activeState.mode === 'questionnaire') {
            await processQuestionnaireAnswer(message, activeState);
            return;
        }

        sendMainMenu(client, from);
    } catch (error) {
        console.error('Error processing incoming message:', error);
        client.sendMessage(from, 'Ocurrió un error procesando tu mensaje. Intenta de nuevo en un momento.');
    }
});

startServer();
initializeClient();
