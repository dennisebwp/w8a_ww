const supabase = require('../lib/supabase');

function toPatientPayload(whatsappNumber, answers = {}) {
    return {
        whatsapp_number: whatsappNumber,
        full_name: answers.full_name || null,
        latest_profile: answers,
        status: 'active',
        updated_at: new Date().toISOString(),
    };
}

async function getPatientByWhatsappNumber(whatsappNumber) {
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('whatsapp_number', whatsappNumber)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

async function upsertPatientProfile(whatsappNumber, answers) {
    const payload = toPatientPayload(whatsappNumber, answers);
    const { data, error } = await supabase
        .from('patients')
        .upsert(payload, { onConflict: 'whatsapp_number' })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function getBotSession(whatsappNumber) {
    const { data, error } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('whatsapp_number', whatsappNumber)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

async function createOrUpdateBotSession(whatsappNumber, currentQuestionId, answers) {
    const existingSession = await getBotSession(whatsappNumber);
    const payload = {
        whatsapp_number: whatsappNumber,
        current_question_id: currentQuestionId,
        answers,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
    };

    const query = existingSession
        ? supabase.from('bot_sessions').update(payload).eq('id', existingSession.id)
        : supabase.from('bot_sessions').insert(payload);

    const { data, error } = await query.select().single();

    if (error) {
        throw error;
    }

    return data;
}

async function completeBotSession(sessionId, patientId, answers) {
    const completedAt = new Date().toISOString();
    const { data, error } = await supabase
        .from('bot_sessions')
        .update({
            patient_id: patientId,
            answers,
            status: 'completed',
            current_question_id: null,
            completed_at: completedAt,
            updated_at: completedAt,
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function cancelBotSession(sessionId) {
    const { error } = await supabase
        .from('bot_sessions')
        .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

    if (error) {
        throw error;
    }
}

async function updatePatientField(whatsappNumber, fieldKey, value) {
    const patient = await getPatientByWhatsappNumber(whatsappNumber);
    if (!patient) {
        return null;
    }

    const nextProfile = {
        ...(patient.latest_profile || {}),
        [fieldKey]: value,
    };

    const payload = {
        latest_profile: nextProfile,
        updated_at: new Date().toISOString(),
    };

    if (fieldKey === 'full_name') {
        payload.full_name = value;
    }

    const { data, error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', patient.id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function listPatients() {
    const { data, error } = await supabase
        .from('patients')
        .select(`
            *,
            diets (*),
            appointments (*),
            progress_logs (*),
            consultations (*)
        `)
        .order('updated_at', { ascending: false });

    if (error) {
        throw error;
    }

    return data;
}

async function getPatientById(patientId) {
    const { data, error } = await supabase
        .from('patients')
        .select(`
            *,
            diets (*),
            appointments (*),
            progress_logs (*),
            consultations (*)
        `)
        .eq('id', patientId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function createDiet(patientId, diet) {
    const { count, error: countError } = await supabase
        .from('diets')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', patientId);

    if (countError) {
        throw countError;
    }

    const version = (count || 0) + 1;
    const { data, error } = await supabase
        .from('diets')
        .insert({
            patient_id: patientId,
            title: diet.title || `Plan semanal v${version}`,
            summary: diet.summary || null,
            meals: {
                ...(diet.meals || {}),
                version,
                targets: diet.targets || {},
                week_plan: diet.week_plan || null,
                generated_message: diet.generated_message || null,
            },
            starts_on: diet.starts_on || null,
            ends_on: diet.ends_on || null,
            calories_target: diet.calories_target || null,
            notes: diet.notes || null,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function createAppointment(patientId, appointment) {
    const { data, error } = await supabase
        .from('appointments')
        .insert({
            patient_id: patientId,
            scheduled_for: appointment.scheduled_for,
            status: appointment.status || 'scheduled',
            location: appointment.location || null,
            notes: appointment.notes || null,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function createProgressLog(patientId, progressLog) {
    const { data, error } = await supabase
        .from('progress_logs')
        .insert({
            patient_id: patientId,
            weight: progressLog.weight || null,
            body_fat_percentage: progressLog.body_fat_percentage || null,
            waist_cm: progressLog.waist_cm || null,
            notes: progressLog.notes || null,
            recorded_at: progressLog.recorded_at || new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function createConsultation(patientId, consultation) {
    const { data, error } = await supabase
        .from('consultations')
        .insert({
            patient_id: patientId,
            summary: consultation.summary || null,
            notes: consultation.notes || null,
            objectives: consultation.objectives || {},
            metrics: consultation.metrics || {},
            weekly_plan: consultation.weekly_plan || {},
            created_by_user_id: consultation.created_by_user_id || null,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function getLatestDietForPatient(patientId) {
    const { data, error } = await supabase
        .from('diets')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

module.exports = {
    getPatientByWhatsappNumber,
    upsertPatientProfile,
    getBotSession,
    createOrUpdateBotSession,
    completeBotSession,
    cancelBotSession,
    updatePatientField,
    listPatients,
    getPatientById,
    createDiet,
    createAppointment,
    createProgressLog,
    createConsultation,
    getLatestDietForPatient,
};
