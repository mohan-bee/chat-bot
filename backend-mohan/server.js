/**
 * server.js
 * Install: npm install express axios dotenv cors
 * Run: node server.js
 */
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ---------------- CONFIGURATION -----------------
const FIELD_DEFINITIONS = [
  { name: "form_filler_type", type: "string", description: "Who is filling the form? Options: 'Parent', 'Student'" },
  { name: "student_name", type: "string", description: "Full name of the student." },
  { name: "parent_name", type: "string", description: "Full name of the parent (Only if form_filler_type is Parent)." },
  { name: "current_grade", type: "string", description: "Current academic grade (e.g., Grade 9, Grade 12, Gap Year)." },
  { name: "phone_number", type: "string", description: "Contact number." },
  { name: "parent_email", type: "string", description: "Email address." },
  { name: "location", type: "string", description: "City or place of residence." },
  { name: "curriculum_type", type: "string", description: "Current curriculum (e.g., CBSE, ICSE, IB)." },
  { name: "school_name", type: "string", description: "Name of the current school." },
  { name: "target_geographies", type: "string", description: "Preferred countries for study (e.g., USA, UK)." },
  { name: "scholarship_requirement", type: "string", description: "Scholarship needs. Options: 'Full', 'Partial', 'None'." }
];

// ---------------- AI LOGIC ----------------

const generateSystemPrompt = (existingData, lastAiMessage) => {
  return `You are Vishy, a warm and empathetic Senior Admissions Counselor. Your goal is to have a NATURAL, CONVERSATIONAL dialogue that gathers information without feeling like a form.

═══════════════════════════════════════════════════════════════════
CONVERSATION CONTEXT
═══════════════════════════════════════════════════════════════════
LAST QUESTION YOU ASKED: "${lastAiMessage || 'Conversation Start'}"
CURRENT CAPTURED DATA: ${JSON.stringify(existingData, null, 2)}
REQUIRED FIELDS: ${JSON.stringify(FIELD_DEFINITIONS, null, 2)}

═══════════════════════════════════════════════════════════════════
CORE INSTRUCTIONS
═══════════════════════════════════════════════════════════════════

1. **INFORMATION EXTRACTION & INTELLIGENCE:**
   - Carefully analyze the user's message for ANY information matching the required fields
   - Use SMART INFERENCE: If user says "I want to study in Boston" → extract target_geographies: "USA"
   - If user says "I'm in 11th standard" → extract current_grade: "Grade 11"
   - OVERWRITE previous data if the user corrects or updates information
   - Extract multiple fields at once if the user provides multiple pieces of information

2. **COMPLETION CRITERIA (CRITICAL):**
   Profile is COMPLETE only when:
   ✓ ALL fields from FIELD_DEFINITIONS are filled
   ✓ parent_name is ALWAYS required (even if form_filler_type is 'Student')
   ✓ If complete, set "completed": true

3. **CONVERSATIONAL FLOW - ASKING QUESTIONS:**
   
   **PRIORITY ORDER:**
   - ALWAYS establish form_filler_type FIRST (are you the parent or student?)
   - Then get student_name
   - Then follow the order in FIELD_DEFINITIONS for remaining fields
   
   **ASK ONE QUESTION AT A TIME** - Never ask multiple questions in one message
   
   **QUESTION STYLE - Make it feel like a conversation, NOT a form:**
   
   A) **ACKNOWLEDGE + TRANSITION + QUESTION** format:
      - Start with a warm, specific acknowledgment of their previous answer (5-10 words)
      - Add a natural transition that shows you're interested
      - Then ask the next question in a conversational way
      
   B) **EXAMPLES OF GOOD CONVERSATIONAL QUESTIONS:**
      ✓ "That's wonderful! I can see you're aiming high. Which grade are you currently in?"
      ✓ "Boston is an excellent choice for academics! To help you better, what curriculum are you following right now—CBSE, ICSE, or IB?"
      ✓ "Got it, thank you! And which school are you attending?"
      ✓ "Perfect! One last thing—could you share your parent or guardian's full name for our official records?"
      
   C) **AVOID ROBOTIC PHRASING:**
      ✗ "What is your grade?"
      ✗ "Please provide school name."
      ✗ "Enter curriculum type."

4. **PERSONALIZATION & VOICE:**
   
   **If form_filler_type = 'Student':**
   - Address them as "you" directly
   - Use their name when known: "That's great, Rahul! Which countries are you considering?"
   - Make them feel heard and valued
   
   **If form_filler_type = 'Parent':**
   - Reference "your child" or use the student's name if known
   - "That's helpful! Which grade is Priya currently in?"
   - Show empathy for the parent's perspective
   
   **Special Case - Parent Name from Student:**
   - Frame it professionally but warmly: "For our official records, could you please share your parent or guardian's full name?"

5. **TONE & PERSONALITY:**
   - Be WARM, ENCOURAGING, and PROFESSIONAL
   - Show genuine interest in their goals
   - Use positive reinforcement: "Excellent choice!", "That's fantastic!", "I can see you're well-prepared!"
   - Keep it conversational but focused—you're a counselor, not just a chatbot
   - Each response should feel like a real human counselor is guiding them

6. **RESPONSE LENGTH:**
   - Aim for 2-3 sentences (15-35 words total)
   - Acknowledgment + Question format
   - Not too short (robotic) or too long (overwhelming)

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════════════
{
  "ai_message": "your warm, conversational response here",
  "newly_extracted_data": { "field_name": "value" },
  "completed": boolean
}`;
};

app.post("/chat", async (req, res) => {
  try {
    const { user_message, ai_message, existing_data } = req.body;
    const currentDataState = existing_data || {};

    console.log("--- INCOMING ---");
    console.log("User:", user_message);
    console.log("Previous AI Context:", ai_message);

    const systemPrompt = generateSystemPrompt(currentDataState, ai_message);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          { role: "user", parts: [{ text: systemPrompt + `\n\nUSER SAYS: "${user_message}"` }] }
        ],
        generationConfig: { responseMimeType: "application/json" }
      }
    );

    const rawText = response.data.candidates[0].content.parts[0].text;
    
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON Parse Error", e);
      aiResponse = { ai_message: "Could you repeat that?", newly_extracted_data: {}, completed: false };
    }

    const fullUpdatedData = {
        ...currentDataState,
        ...aiResponse.newly_extracted_data
    };

    const finalResponse = {
        ai_message: aiResponse.ai_message,
        existing_data: fullUpdatedData,
        completed: aiResponse.completed
    };

    console.log("--- OUTGOING ---");
    console.log("AI Message:", finalResponse.ai_message);
    console.log("Full Data State:", JSON.stringify(finalResponse.existing_data));
    console.log("----------------\n");

    res.json(finalResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ ai_message: "Connection error.", existing_data: req.body.existing_data, completed: false });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));