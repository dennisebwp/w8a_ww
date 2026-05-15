const express = require('express');
const {
    listPatients,
    getPatientById,
    createDiet,
    createAppointment,
    createProgressLog,
    createConsultation,
    getLatestDietForPatient,
} = require('../services/patientService');
const { loadQuestions, saveQuestionFlow } = require('../services/questionFlowService');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { searchFoods } = require('../services/foodService');
const { client } = require('../whatsappClient');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/me', async (req, res) => {
    res.json({
        user: {
            id: req.authUser.id,
            email: req.authUser.email,
            full_name: req.authUser.user_metadata?.full_name || req.authUser.user_metadata?.name || null,
        },
    });
});

router.get('/patients', async (req, res) => {
    try {
        const patients = await listPatients();
        res.json(patients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/patients/:patientId', async (req, res) => {
    try {
        const patient = await getPatientById(req.params.patientId);
        res.json(patient);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/patients/:patientId/diets', async (req, res) => {
    try {
        const diet = await createDiet(req.params.patientId, req.body);
        res.status(201).json(diet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/patients/:patientId/appointments', async (req, res) => {
    try {
        const appointment = await createAppointment(req.params.patientId, req.body);
        res.status(201).json(appointment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/patients/:patientId/progress-logs', async (req, res) => {
    try {
        const progressLog = await createProgressLog(req.params.patientId, req.body);
        res.status(201).json(progressLog);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/patients/:patientId/consultations', async (req, res) => {
    try {
        const consultation = await createConsultation(req.params.patientId, {
            ...req.body,
            created_by_user_id: req.authUser.id,
        });
        res.status(201).json(consultation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/patients/:patientId/send-latest-diet', async (req, res) => {
    try {
        const patient = await getPatientById(req.params.patientId);
        const diet = await getLatestDietForPatient(req.params.patientId);

        if (!patient || !diet) {
            return res.status(404).json({ error: 'Patient or latest diet not found.' });
        }

        const savedMessage = String(diet.meals?.generated_message || '').trim();

        if (savedMessage) {
            await client.sendMessage(patient.whatsapp_number, savedMessage);
            return res.json({ ok: true });
        }

        const weekPlan = diet.meals?.week_plan?.days || [];
        const targets = diet.meals?.targets || {};
        const lines = [
            `Hola ${patient.full_name || ''}, aquí tienes tu plan semanal.`,
            '',
            `Objetivo calórico: ${targets.calories || diet.calories_target || 'N/D'} kcal`,
            `Proteína: ${targets.protein || 'N/D'} g | Carbohidratos: ${targets.carbs || 'N/D'} g | Grasas: ${targets.fat || 'N/D'} g`,
            '',
            ...weekPlan.map((day) => {
                const meals = (day.meals || [])
                    .map((meal) => `${meal.label}: ${(meal.items || []).map((item) => `${item.name} (${item.grams}g)`).join(', ') || 'Sin alimentos'}`)
                    .join('\n');
                return `*${day.label}*\n${meals}`;
            }),
        ];

        await client.sendMessage(patient.whatsapp_number, lines.join('\n'));
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/foods/search', async (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        if (!query) {
            return res.status(400).json({ error: 'Query q is required.' });
        }

        const foods = await searchFoods(query);
        res.json(foods);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/question-flow', async (req, res) => {
    try {
        const questionFlow = await loadQuestions(true);
        res.json(questionFlow);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/question-flow', async (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ error: 'Expected an array of question definitions.' });
        }

        const questionFlow = await saveQuestionFlow(req.body);
        res.json(questionFlow);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
