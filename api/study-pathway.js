const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

async function generateStudyPathway(topic, grade) {
  const prompt = `
      Create a detailed study pathway for the topic "${topic}" at the "${grade}" level. 
      The pathway should be divided into 3-5 stages, each with the following structure:
      
      <h2>Stage X: [Stage Name]</h2>
      <h3>Foundational Skills</h3>
      <ul>
          <li>[Skill 1]</li>
          <li>[Skill 2]</li>
      </ul>
      <h3>Core Topics</h3>
      <ul>
          <li>[Topic 1]</li>
          <li>[Topic 2]</li>
      </ul>
      <h3>Optional Electives</h3>
      <ul>
          <li>[Elective 1]</li>
          <li>[Elective 2]</li>
      </ul>

      Ensure each stage has all three sections: Foundational Skills, Core Topics, and Optional Electives.
      Each section should have at least 2 items.
      Use NCERT books as a reference for topics and titles where applicable.
      Provide the complete response in HTML format as shown above.
      Aim for at least 3 stages, but no more than 5.
      Keep the total response under 4000 characters.
  `;
  try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = await response.text();
      return text;
  } catch (error) {
      console.error('Error generating study pathway:', error);
      return '<div class="study-pathway">Error generating study pathway</div>';
  }
}

module.exports = async (req, res) => {
  const { topic, grade } = req.query;
  if (!topic || !grade) {
    return res.status(400).json({ error: 'Topic and grade are required.' });
  }
  try {
    const pathway = await generateStudyPathway(topic, grade);
    res.status(200).json({ pathway });
  } catch (error) {
    console.error('Error in /study-pathway:', error);
    res.status(500).json({ error: `Error generating study pathway: ${error.message}` });
  }
};