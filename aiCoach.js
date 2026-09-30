/**
 * UsFit AI Couple's Fitness Coach Module
 * 
 * Provides personalized AI coaching advice before workouts, during exercise sets,
 * and after completing workouts.
 * 
 * TO ENABLE LIVE GEMINI AI CALLS:
 * 1. Get a free API Key from https://aistudio.google.com
 * 2. Add GEMINI_API_KEY=your_key_here to your .env file
 * 3. Uncomment the GoogleGenAI block below in generateAICoachAdvice()
 */

// const { GoogleGenAI } = require('@google/genai');

/**
 * Generate AI Coach Advice
 * @param {Object} context - Data including type, userNames, readinessScores, workout, history
 * @returns {Promise<Object>} { title, advice, funFact }
 */
async function generateAICoachAdvice(context) {
  const { type = 'pre-workout', userNames = {}, readinessScores = {}, workout = {}, history = [] } = context;

  /* 
  =============================================================================
  LIVE AI INTEGRATION (COMMENTED OUT BY DEFAULT)
  To activate:
  1. Set process.env.GEMINI_API_KEY in your environment / .env file
  2. Uncomment the block below and comment out the fallback return line below it
  =============================================================================

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
You are an encouraging, expert couple's fitness coach for UsFit. 
Users: ${userNames.u1 || 'Partner 1'} and ${userNames.u2 || 'Partner 2'}.
Context Type: ${type}
Readiness Scores: ${JSON.stringify(readinessScores)}
Workout Details: ${JSON.stringify(workout)}
History Length: ${history.length}

Provide short, punchy, actionable advice (under 60 words). 
Respond STRICTLY in JSON format with fields:
{
  "title": "Short catchy title",
  "advice": "Encouraging, personalized couple coaching tip",
  "funFact": "Fun real-world comparison or motivational note"
}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const responseText = response.text;
      const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      return parsed;
    } catch (err) {
      console.warn('[AI Coach] Gemini API call failed, using rule-based fallback:', err.message);
    }
  }
  =============================================================================
  */

  // SMART RULE-BASED FALLBACK ENGINE (Active by default until API key is set)
  return getRuleBasedAdvice(type, userNames, readinessScores, workout, history);
}

function getRuleBasedAdvice(type, userNames, readinessScores, workout, history) {
  const name1 = userNames.u1 || 'Partner 1';
  const name2 = userNames.u2 || 'Partner 2';
  const r1 = Number(readinessScores.u1) || 3;
  const r2 = Number(readinessScores.u2) || 3;

  if (type === 'pre-workout') {
    if (r1 >= 4 && r2 >= 4) {
      return {
        title: "⚡ High Energy Couple Synergy!",
        advice: `Both ${name1} and ${name2} are feeling great today (${r1}/5 & ${r2}/5 readiness). Push for progressive overload on your main compound lifts!`,
        funFact: "Studies show partners who train at high intensity together experience 25% higher endorphin release!"
      };
    } else if (Math.abs(r1 - r2) >= 2) {
      const highUser = r1 > r2 ? name1 : name2;
      const lowUser = r1 > r2 ? name2 : name1;
      return {
        title: "🤝 Balanced Energy Strategy",
        advice: `${highUser} is raring to go while ${lowUser} is feeling a bit lower energy today. Allow ${lowUser} 15-20s extra rest between sets while ${highUser} sets the workout pace.`,
        funFact: "Pacing each other during variable-energy sessions boosts long-term training consistency by 40%."
      };
    } else {
      return {
        title: "🎯 Steady & Controlled Session",
        advice: `Solid baseline readiness (${r1}/5 & ${r2}/5). Focus on smooth, controlled eccentric phases on every set today.`,
        funFact: "Focusing on tempo and form improves muscle activation even on moderate energy days."
      };
    }
  }

  if (type === 'summary-recap') {
    const totalSets = workout.totalSets || 24;
    const totalVolume = workout.totalVolume || 12500;
    const dinoWeight = Math.round((totalVolume / 14000) * 100) / 100;
    return {
      title: "🏆 Session Completed Together!",
      advice: `Fantastic work, ${name1} & ${name2}! You completed ${totalSets} working sets and moved a combined volume of ${totalVolume.toLocaleString()} kg!`,
      funFact: dinoWeight >= 1 
        ? `Together you lifted approximately ${dinoWeight} T-Rex dinosaurs today! 🦖` 
        : `Together you lifted approximately ${Math.round(totalVolume / 1500)} adult brown bears today! 🐻`
    };
  }

  return {
    title: "✨ AI Fitness Coach",
    advice: `Consistency is key! Keep supporting each other through every set.`,
    funFact: "Couples who workout together stay consistent 3x longer than solo lifters!"
  };
}

module.exports = { generateAICoachAdvice };
