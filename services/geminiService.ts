import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

// Initialize the client strictly with process.env.API_KEY
if (process.env.API_KEY) {
  aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

export const askGemini = async (prompt: string, context: string = ""): Promise<string> => {
  if (!aiClient) {
    return "AI service is unavailable. Please check your API configuration.";
  }

  try {
    const model = "gemini-2.5-flash";
    const systemInstruction = `You are a helpful crypto wallet assistant for the '3Twenty Coin' wallet. 
    You are knowledgeable about Binance Smart Chain (BSC), DeFi, and wallet security.
    Keep answers concise and helpful for a mobile/web wallet interface.
    
    Current Wallet Context: ${context}
    `;

    const response = await aiClient.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Sorry, I encountered an error while processing your request.";
  }
};