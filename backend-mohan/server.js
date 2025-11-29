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
  { name: "form_filler_type", type: "string", description: "Who is filling the form? (Parent/Student). Infer from context like 'I am a dad' or 'I am looking for college'." },
  { name: "student_name", type: "string", description: "Full name of the student." },
  { name: "current_grade", type: "string", description: "Current academic grade (e.g., Grade 9, 12, Gap Year)." },
  { name: "phone_number", type: "string", description: "Contact number." },
  { name: "parent_email", type: "string", description: "Email address." },
  { name: "location", type: "string", description: "City or place of residence." },
  { name: "curriculum_type", type: "string", description: "Current curriculum (CBSE, ICSE, IB, State Board, etc)." },
  { name: "school_name", type: "string", description: "Name of the current school." },
  { name: "target_geographies", type: "string", description: "Preferred countries for study (USA, UK, Canada, etc)." },
  { name: "scholarship_requirement", type: "string", description: "Scholarship needs (Full, Partial, None)." },
  { name: "parent_name", type: "string", description: "Full name of the parent (Only if filler is Student)." }, 
];

// ---------------- HELPER LOGIC ----------------

// 1. Logic to find the primary target (What we need next)
const getNextMissingField = (existingData) => {
  for (const field of FIELD_DEFINITIONS) {
    // Logic: Skip parent_name if we know for sure the user is the Parent
    if (field.name === "parent_name") {
      if (existingData.form_filler_type && existingData.form_filler_type.toLowerCase() === "student") {
        // Keep it; if student is filling, we need parent name.
      } else if (existingData.form_filler_type && existingData.form_filler_type.toLowerCase() === "parent") {
        // Skip it; if parent is filling, we usually assume the contact name is the parent.
        continue; 
      }
    }

    // Check if data is missing
    if (!existingData[field.name] || existingData[field.name].trim() === "") {
      return field;
    }
  }
  return null; 
};

// 2. Normalize to ensure client always gets consistent object keys
const normalizeDataStructure = (data) => {
  const completeData = {};
  FIELD_DEFINITIONS.forEach(field => {
    completeData[field.name] = data[field.name] !== undefined ? data[field.name] : "";
  });
  return completeData;
};

// ---------------- AI PROMPT GENERATION ----------------

const generateSystemPrompt = (existingData, nextField) => {
  
  // Create a status report of what we have vs what we need
  const fieldStatusList = FIELD_DEFINITIONS.map(field => {
    const val = existingData[field.name] || ""; 
    const status = val ? `[FILLED: "${val}"]` : `[MISSING]`;
    return `- ${field.name} (${field.description}): ${status}`;
  }).join("\n");

  const targetInstruction = nextField 
    ? `PRIMARY GOAL: Politely ask for "${nextField.name}".` 
    : "PRIMARY GOAL: All data is collected. Thank the user and confirm registration.";

  return `
  ROLE: You are Vishy, a warm, smart Senior Admissions Counselor.
  
  --- DATA SCHEMA & STATUS ---
${fieldStatusList}
  ----------------------------

  ${targetInstruction}

  **CRITICAL RULES FOR EXTRACTION (DO NOT IGNORE):**
  1. **SCAN EVERYTHING**: The user might provide multiple fields in one sentence (e.g., "I'm John from Delhi" -> extract 'student_name' AND 'location'). 
  2. **CHECK HISTORY**: Look at the conversation history. If the user mentioned a detail 3 turns ago that is marked [MISSING] above, EXTRACT IT NOW.
  3. **NO REPEATS**: Do NOT ask for a field marked [FILLED] above. If the user just gave it, acknowledge it and move on.
  4. **INFERENCE**: 
     - If user says "My son needs admission", set 'form_filler_type' = 'Parent'.
     - If user says "I want to study in London", set 'target_geographies' = 'UK'.

  **RESPONSE GUIDELINES**:
  1. Update 'newly_extracted_data' with ANY field found in the user's message or history that is currently [MISSING].
  2. Construct 'ai_message' to acknowledge what was received and ask the PRIMARY GOAL question naturally.
  3. Keep the tone conversational, short, and encouraging.

  OUTPUT FORMAT (JSON ONLY):
  {
    "ai_message": "String response to user",
    "newly_extracted_data": { "field_name": "value", "another_field": "value" },
    "completed": boolean
  }
  `;
};

app.post("/chat", async (req, res) => {
  try {
    let { user_message, conversation_history, existing_data } = req.body;
    
    conversation_history = conversation_history || [];
    // Ensure existing_data is normalized (no undefined fields)
    let currentDataState = normalizeDataStructure(existing_data || {});

    console.log(`\n--- TURN START ---`);
    console.log(`User: "${user_message}"`);

    // 1. Calculate the Target Field based on current DB state
    const nextField = getNextMissingField(currentDataState);
    
    // 2. Generate Prompt
    const systemInstructionText = generateSystemPrompt(currentDataState, nextField);

    // 3. Call Gemini
    const geminiPayload = {
      system_instruction: { parts: [{ text: systemInstructionText }] },
      contents: [
        ...conversation_history, 
        { role: "user", parts: [{ text: user_message }] }
      ],
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.2 // Lower temperature for more precise data extraction
      }
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
      console.error("JSON Parse Error on AI response", rawText);
      // Fallback
      aiResponse = { 
        ai_message: "I didn't quite catch that details. Could you repeat?", 
        newly_extracted_data: {}, 
        completed: false 
      };
    }

    // 4. MERGE DATA
    // We merge the old data with the newly extracted data
    // This allows the AI to fill 3 fields at once if the user provided them
    let fullUpdatedData = { ...currentDataState, ...aiResponse.newly_extracted_data };
    
    // 5. RE-EVALUATE COMPLETION AFTER EXTRACTION
    // We check if we are *actually* done after this update
    const nextMissingAfterUpdate = getNextMissingField(fullUpdatedData);
    const isActuallyComplete = !nextMissingAfterUpdate;

    // Override AI's completion flag if logic says we aren't done
    const finalCompletionStatus = isActuallyComplete; 

    // 6. Update History (Client needs this for next turn)
    const newHistory = [
        ...conversation_history,
        { role: "user", parts: [{ text: user_message }] },
        { role: "model", parts: [{ text: aiResponse.ai_message }] }
    ];

    const finalResponse = {
        ai_message: aiResponse.ai_message,
        existing_data: fullUpdatedData, // Send back the merged data
        completed: finalCompletionStatus,
        conversation_history: newHistory,
        meta_info: {
            extracted_this_turn: aiResponse.newly_extracted_data,
            next_target: nextMissingAfterUpdate ? nextMissingAfterUpdate.name : "COMPLETE"
        }
    };

    console.log(`Extracted:`, Object.keys(aiResponse.newly_extracted_data));
    console.log(`AI Reply: "${aiResponse.ai_message}"`);
    console.log(`Next Target: ${finalResponse.meta_info.next_target}`);
    console.log(`--- TURN END ---\n`);

    res.json(finalResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));