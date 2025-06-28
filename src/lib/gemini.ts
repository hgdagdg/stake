const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function generateDebateSummary(
  topic: string,
  messages: Array<{ content: string; side?: 'side_a' | 'side_b'; timestamp: string }>,
  votes: { side_a: number; side_b: number }
) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const sideAMessages = messages.filter(m => m.side === 'side_a').map(m => m.content);
  const sideBMessages = messages.filter(m => m.side === 'side_b').map(m => m.content);
  
  const prompt = `
Generate a comprehensive summary of this debate on the topic: "${topic}"

Side A Arguments (${votes.side_a} votes):
${sideAMessages.join('\n')}

Side B Arguments (${votes.side_b} votes):
${sideBMessages.join('\n')}

Please provide:
1. A brief overview of the debate topic
2. Key arguments from both sides
3. Most compelling points made
4. The voting outcome
5. A balanced conclusion

Keep the summary objective, informative, and engaging for readers who want to understand the debate without reading all messages.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || 'Summary could not be generated.';
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error('Failed to generate debate summary');
  }
}