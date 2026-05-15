const supabase = require('../lib/supabase');
const defaultQuestionFlow = require('../config/defaultQuestionFlow');
const { normalizeText } = require('../utils/normalization');

let cachedQuestions = null;

function mapQuestionRecord(record) {
    return {
        id: record.id,
        sortOrder: record.sort_order,
        prompt: record.prompt,
        fieldKey: record.field_key,
        inputType: record.input_type,
        validation: record.validation || {},
        branchMap: record.branch_map || {},
        nextQuestionId: record.next_question_id || null,
        isActive: record.is_active !== false,
    };
}

async function loadQuestions(forceRefresh = false) {
    if (cachedQuestions && !forceRefresh) {
        return cachedQuestions;
    }

    const { data, error } = await supabase
        .from('question_flows')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('Error loading question flow from Supabase:', error.message);
        cachedQuestions = defaultQuestionFlow;
        return cachedQuestions;
    }

    if (!data || !data.length) {
        cachedQuestions = defaultQuestionFlow;
        return cachedQuestions;
    }

    cachedQuestions = data.map(mapQuestionRecord);
    return cachedQuestions;
}

async function getQuestionMap() {
    const questions = await loadQuestions();
    return new Map(questions.map((question) => [question.id, question]));
}

function toDatabaseRecord(question) {
    return {
        id: question.id,
        sort_order: question.sortOrder,
        prompt: question.prompt,
        field_key: question.fieldKey,
        input_type: question.inputType,
        validation: question.validation || {},
        branch_map: question.branchMap || {},
        next_question_id: question.nextQuestionId || null,
        is_active: question.isActive !== false,
    };
}

async function getFirstQuestion() {
    const questions = await loadQuestions();
    return questions[0] || null;
}

async function getQuestionById(questionId) {
    const map = await getQuestionMap();
    return map.get(questionId) || null;
}

function validateAnswer(question, answer) {
    const value = String(answer || '').trim();
    const rules = question.validation || {};

    if (rules.required && !value) {
        return 'Este campo es obligatorio.';
    }

    if (!value) {
        return null;
    }

    if (question.inputType === 'number') {
        const numberValue = Number(value);
        if (Number.isNaN(numberValue)) {
            return 'Por favor responde con un número válido.';
        }

        if (rules.min !== undefined && numberValue < rules.min) {
            return `El valor mínimo permitido es ${rules.min}.`;
        }

        if (rules.max !== undefined && numberValue > rules.max) {
            return `El valor máximo permitido es ${rules.max}.`;
        }
    }

    if (rules.allowedValues) {
        const normalized = normalizeText(value);
        const allowed = rules.allowedValues.map(normalizeText);
        if (!allowed.includes(normalized)) {
            return `Respuesta inválida. Opciones permitidas: ${rules.allowedValues.join(', ')}.`;
        }
    }

    return null;
}

function resolveNextQuestionId(question, answer) {
    const normalized = normalizeText(answer);
    if (question.branchMap && question.branchMap[normalized]) {
        return question.branchMap[normalized];
    }

    return question.nextQuestionId || null;
}

async function saveQuestionFlow(questions) {
    const payload = questions.map(toDatabaseRecord);
    const { error } = await supabase
        .from('question_flows')
        .upsert(payload, { onConflict: 'id' });

    if (error) {
        throw error;
    }

    return loadQuestions(true);
}

module.exports = {
    loadQuestions,
    getFirstQuestion,
    getQuestionById,
    validateAnswer,
    resolveNextQuestionId,
    saveQuestionFlow,
};
