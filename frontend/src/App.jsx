import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const datatypes = ["string", "number", "boolean", "date", "email", "url", "text"];

export default function App() {
  const [fields, setFields] = useState([{ name: "", desc: "", datatype: "string" }]);
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [existingData, setExistingData] = useState({});
  const [loading, setLoading] = useState(false);

  const addFields = () => {
    setFields((prev) => [...prev, { name: "", desc: "", datatype: "string" }]);
  };

  const handleFieldChange = (i, key, value) => {
    const updated = [...fields];
    updated[i][key] = value;
    setFields(updated);
  };

  // --- START CONVERSATION: AI speaks FIRST ---
  const startConversation = async () => {
    setChat([]);
    setExistingData({});

    const cleanedFields = fields.map((f) => ({
      name: f.name.trim(),
      datatype: f.datatype.trim(),
      description: f.desc.trim(),
    }));

    const res = await fetch("http://localhost:8080/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: "",
        fields: cleanedFields,
        existing_data: {},
        start: true
      }),
    });

    const data = await res.json();
    const parsed = safeJSONParse(data.output);

    setChat([{ sender: "ai", text: parsed.ai_message }]);
    setExistingData(parsed.extracted_data || {});
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setMessage("")
    setChat((prev) => [...prev, { sender: "user", text: message }]);
    setLoading(true);

    try {
      const cleanedFields = fields.map((f) => ({
        name: f.name,
        datatype: f.datatype,
        description: f.desc,
      }));

      const res = await fetch("http://localhost:8080/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: message,
          fields: cleanedFields,
          existing_data: existingData,
          start: false
        }),
      });

      const data = await res.json();
      const parsed = safeJSONParse(data.output);

      setChat((prev) => [...prev, { sender: "ai", text: parsed.ai_message }]);
      setExistingData(parsed.extracted_data);
      setMessage("");
    } catch (err) {
      console.error(err);
      setChat((prev) => [...prev, { sender: "ai", text: "Server error." }]);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 flex gap-6">
      {/* Field Builder */}
      <div className="w-1/3 bg-white p-6 rounded-xl shadow space-y-4 h-fit">
        <h1 className="text-xl font-semibold text-gray-800">
          🎯 Define Data Fields
        </h1>

        {fields.map((field, i) => (
          <div key={i} className="p-4 border rounded-xl bg-gray-50 grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-700">Name</label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => handleFieldChange(i, "name", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Datatype</label>
              <Dropdown
                value={field.datatype}
                onChange={(val) => handleFieldChange(i, "datatype", val)}
                options={datatypes}
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Description</label>
              <textarea
                value={field.desc}
                onChange={(e) => handleFieldChange(i, "desc", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              />
            </div>
          </div>
        ))}

        <button
          onClick={addFields}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + Add Field
        </button>

        <button
          onClick={startConversation}
          className="w-full py-2 mt-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          🚀 Start Conversation
        </button>
      </div>

      {/* Chat UI */}
      <div className="w-2/3 bg-white p-6 rounded-xl shadow flex flex-col">
        <h1 className="text-xl font-semibold text-gray-800">💬 AI Conversation</h1>

        <div className="flex-1 mt-4 mb-4 p-4 border rounded-lg bg-gray-50 overflow-auto h-[500px]">
          {chat.map((c, i) => (
            <div
              key={i}
              className={`p-3 my-2 rounded-lg w-fit max-w-[70%] ${
                c.sender === "user" ? "bg-blue-600 text-white ml-auto" : "bg-white border"
              }`}
            >
              {c.text}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            placeholder="Type your message..."
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>

        <div className="mt-4 p-4 border rounded-lg bg-gray-50 h-56 overflow-auto">
          <pre className="text-xs text-gray-700">{JSON.stringify(existingData, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function safeJSONParse(value) {
  // If already an object (correct format), return it as is
  if (typeof value === "object") {
    return value;
  }

  // If string → extract & parse JSON
  try {
    const match = value.match(/\{[\s\S]*\}/);
    return JSON.parse(match[0]);
  } catch {
    return {
      ai_message: "Invalid JSON",
      extracted_data: {},
      is_complete: false
    };
  }
}


const Dropdown = ({ value, onChange, options }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-3 py-2 border rounded-lg">
        <span>{value}</span>
        <ChevronDown className={`h-4 w-4 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute w-full bg-white border rounded-lg shadow-lg z-20">
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
