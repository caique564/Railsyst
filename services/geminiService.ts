
import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeFrame(base64Image: string): Promise<AIAnalysis> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          {
            text: `Aja como um Sistema de Visão Computacional de Alta Sensibilidade.
            Seu objetivo é detectar QUALQUER OBJETO ou ENTIDADE que entre na zona de monitoramento (focando na linha horizontal no terço inferior da imagem).
            
            DIRETRIZES DE TESTE:
            1. Identifique qualquer objeto diferente do ambiente estático (Mãos, Celulares, Borrachas, Canetas, Veículos, etc).
            2. Analise a posição em relação à 'LINHA DE CONTROLE' (Stop Line):
               - 'approaching': O objeto está na imagem mas ainda não tocou a linha.
               - 'at_stop_line': O objeto está exatamente sobre ou encostado na linha.
               - 'crossing': O objeto ultrapassou a linha em direção ao topo/fundo da imagem.
               - 'gone': Nenhum objeto detectado.
            3. Verificação de Imobilidade: Se o objeto estiver na linha e não houver sinais de movimento, isMoving = false.
            
            Retorne APENAS um JSON estrito seguindo o schema.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vehiclePresent: { 
              type: Type.BOOLEAN, 
              description: "True se QUALQUER objeto estranho for detectado" 
            },
            status: { type: Type.STRING, enum: ['approaching', 'at_stop_line', 'crossing', 'gone'] },
            isMoving: { type: Type.BOOLEAN },
            vehicleType: { 
              type: Type.STRING, 
              description: "Descrição exata do objeto (ex: 'Mão Esquerda', 'Celular Preto', 'Borracha Azul')" 
            }
          },
          required: ["vehiclePresent", "status", "isMoving"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result as AIAnalysis;
  } catch (error) {
    console.error("Erro na análise Gemini:", error);
    return { vehiclePresent: false, status: 'gone', isMoving: false };
  }
}
