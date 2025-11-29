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
  { name: "current_grade", type: "string", description: "Current academic grade (e.g., Grade 9, Grade 12, Gap Year)." },
  { name: "phone_number", type: "string", description: "Contact number." },
  { name: "parent_email", type: "string", description: "Email address." },
  { name: "location", type: "string", description: "City or place of residence." },
  { name: "curriculum_type", type: "string", description: "Current curriculum (e.g., CBSE, ICSE, IB)." },
  { name: "school_name", type: "string", description: "Name of the current school." },
  { name: "target_geographies", type: "string", description: "Preferred countries for study (e.g., USA, UK)." },
  { name: "scholarship_requirement", type: "string", description: "Scholarship needs. Options: 'Full', 'Partial', 'None'." },
  { name: "parent_name", type: "string", description: "Full name of the parent." }, 
];

// ---------------- HELPER LOGIC ----------------

// 1. Logic to find what is TRULY missing based on business rules
const getNextMissingField = (existingData) => {
  for (const field of FIELD_DEFINITIONS) {
    // Rule: Skip parent_name if the user is a Student
    if (field.name === "parent_name") {
      if (existingData.form_filler_type === "Student") continue; 
    }

    // Check if data is missing or empty
    if (!existingData[field.name] || existingData[field.name].trim() === "") {
      return field;
    }
  }
  return null; 
};

// 2. Normalize: Ensure response always contains ALL keys (even if empty)
const normalizeDataStructure = (data) => {
  const completeData = {};
  FIELD_DEFINITIONS.forEach(field => {
    completeData[field.name] = data[field.name] !== undefined ? data[field.name] : "";
  });
  return completeData;
};

// ---------------- AI PROMPT GENERATION ----------------

const generateSystemPrompt = (existingData, nextField) => {
  
  // CHANGED: We now loop through definitions to list EVERYTHING (Filled or Empty)
  const fullFormStatus = FIELD_DEFINITIONS.map(field => {
    const val = existingData[field.name] || ""; // Default to empty string
    return `- ${field.name}: "${val}"`;        // Output: - student_name: "John" OR - student_name: ""
  }).join("\n");

  const targetInstruction = nextField 
    ? `TARGET FIELD: "${nextField.name}" (${nextField.description})` 
    : "ALL DATA COLLECTED. Thank the user and confirm completion.";

  return `
  ROLE: You are Vishy, a warm, empathetic Senior Admissions Counselor.
  
  --- CURRENT FORM STATE (ALL FIELDS) ---
${fullFormStatus}
  ---------------------------------------
  
  ${targetInstruction}

  CORE INSTRUCTIONS:
  1. **HISTORY AWARENESS**: Look at the "Conversation History". 
     - If the user mentioned a hobby, interest, or feeling earlier, reference it.
     - Adapt tone based on their previous responses.
  
  2. **ONE GOAL**: Your only job is to get the "TARGET FIELD" naturally.
     - Do NOT ask for multiple fields at once.
     - Do NOT ask for fields that already have a value in "CURRENT FORM STATE".
  
  3. **DATA EXTRACTION**:
     - Check the user's latest message.
     - If they provided new info, extract it into the JSON.
     - If they corrected old info, overwrite it.

  OUTPUT FORMAT (JSON ONLY):
  {
    "ai_message": "Your conversational response here...",
    "newly_extracted_data": { "field_name": "value" },
    "completed": boolean
  }
  `;
};

app.post("/chat", async (req, res) => {
  try {
    let { user_message, conversation_history, existing_data } = req.body;
    
    conversation_history = conversation_history || [];
    const currentDataState = existing_data || {};

    console.log("--- INCOMING ---");
    console.log("User Input:", user_message);
    
    // 1. Calculate next step
    const nextField = getNextMissingField(currentDataState);
    const systemInstructionText = generateSystemPrompt(currentDataState, nextField);

    // 2. AI Request
    const geminiPayload = {
      system_instruction: { parts: [{ text: systemInstructionText }] },
      contents: [
        ...conversation_history, 
        { role: "user", parts: [{ text: user_message }] }
      ],
      generationConfig: { responseMimeType: "application/json" }
    };

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      geminiPayload
    );

    const rawText = response.data.candidates[0].content.parts[0].text;
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON Parse Error", e);
      aiResponse = { ai_message: "Could you say it again?", newly_extracted_data: {}, completed: false };
    }

    // 3. Update Data
    let fullUpdatedData = { ...currentDataState, ...aiResponse.newly_extracted_data };
    
    // 4. Normalize Data (Make sure all keys exist for the client too)
    fullUpdatedData = normalizeDataStructure(fullUpdatedData);

    // 5. Update History
    const newHistory = [
        ...conversation_history,
        { role: "user", parts: [{ text: user_message }] },
        { role: "model", parts: [{ text: aiResponse.ai_message }] }
    ];

    // 6. Meta Logic
    const remainingMissing = getNextMissingField(fullUpdatedData);
    const filledCount = Object.values(fullUpdatedData).filter(v => v && v.trim() !== "").length;

    const finalResponse = {
        ai_message: aiResponse.ai_message,
        existing_data: fullUpdatedData,
        completed: aiResponse.completed,
        conversation_history: newHistory,
        meta_info: {
            current_target_field: nextField ? nextField.name : "None",
            next_target_field: remainingMissing ? remainingMissing.name : "None",
            last_extracted: aiResponse.newly_extracted_data,
            total_fields: FIELD_DEFINITIONS.length,
            fields_filled_count: filledCount
        }
    };

    console.log("--- OUTGOING ---");
    console.log("Targeting:", finalResponse.meta_info.next_target_field);
    console.log("----------------\n");

    res.json(finalResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));