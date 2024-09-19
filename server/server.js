const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require('googleapis');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

// API key setup
//const API_KEY = process.env.API_KEY;
const API_KEY = "AIzaSyBLvP6wb7dV3myixOOb5lqZLFm5ePrdP6U";
// Google Generative AI setup
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// YouTube API setup
const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

async function generateStudyPathwayStage(topic, grade, stageNumber) {
  const prompt = `
    Create a single stage for a study pathway on the topic "${topic}" at the "${grade}" level.
    This should be stage number ${stageNumber} of a 3 to 5-stage pathway.
    Use the following structure:
    use <b> to bold any subtopics or topics.
    <h2>Stage ${stageNumber}: [Stage Name]</h2>
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
    <h3>Learning Activities</h3>
    <ul>
        <li>[Activity 1]</li>
        <li>[Activity 2]</li>
    </ul>

    Keep the response under 500 characters.
  `;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return text;
  } catch (error) {
    console.error(`Error generating stage ${stageNumber}:`, error);
    return `<div class="study-pathway">Error generating stage ${stageNumber}. Please try again.</div>`;
  }
}

async function generateStudyPathway(topic, grade) {
  const cacheKey = `pathway_${topic}_${grade}`;
  const cachedPathway = cache.get(cacheKey);
  if (cachedPathway) {
    return cachedPathway;
  }

  try {
    const stages = await Promise.all([
      generateStudyPathwayStage(topic, grade, 1),
      generateStudyPathwayStage(topic, grade, 2),
      generateStudyPathwayStage(topic, grade, 3)
    ]);
    const pathway = stages.join('\n');
    cache.set(cacheKey, pathway);
    return pathway;
  } catch (error) {
    console.error('Error generating study pathway:', error);
    return '<div class="study-pathway">Error generating study pathway. Please try again.</div>';
  }
}

async function generateAINotes(topic, grade, stage) {
  const prompt = `
    Generate concise and informative study notes for the topic "${topic}" specifically focusing on "${stage}" at the "${grade}" level. 
    Ensure the notes are tailored to the current stage of learning, covering the foundational skills, core topics, and learning activities mentioned for this stage.
    Include key concepts, definitions, and important points relevant to this stage. 
    Format the notes with HTML, using appropriate tags like <h3> for subtopics, <p> for paragraphs, and <ul> or <ol> for lists.
    Use <b> tags to highlight important terms or concepts.
    Limit the response to around 500 words.
    Example format:
    <h3>Key Concept for ${stage}</h3>
    <p>Brief explanation of a concept specific to this stage.</p>
    <ul>
        <li><b>Important term:</b> Definition relevant to this stage</li>
        <li>Key point related to a foundational skill for this stage</li>
    </ul>
    <h3>Core Topic from ${stage}</h3>
    <p>Explanation of a core topic mentioned in this stage.</p>
    <ol>
        <li>Step or detail related to a learning activity for this stage</li>
        <li>Another important point specific to this stage of learning</li>
    </ol>
  `;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Error generating AI notes:', error);
    return `<p>Error generating AI notes: ${error.message}. Please try again.</p>`;
  }
}

async function generateAIQuestions(topic, grade) {
  const prompt = `
      Generate a set of 5 thought-provoking questions about "${topic}" suitable for "${grade}" level students. 
      Include a mix of factual recall and analytical questions. 
      Format the response as an HTML ordered list (<ol>) with each question as a list item (<li>).
  `;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return `<ol>${text}</ol>`;
  } catch (error) {
    console.error('Error generating AI questions:', error);
    return '<p>Error generating AI questions</p>';
  }
}

async function generateVideoLinks(topic, grade, stage) {
  try {
    const stageNumber = stage.match(/\d+/) ? stage.match(/\d+/)[0] : '';
    const stageName = stage.replace(/Stage \d+:?/, '').trim();

    const searchQueries = [
      `${topic} ${grade} "${stageName}" -shorts`,
      `${topic} ${stageName} tutorial -shorts`,
      `${grade} ${topic} ${stageNumber ? `stage ${stageNumber}` : stageName} lesson -shorts`
    ];
    
    let allVideos = [];

    for (const query of searchQueries) {
      const response = await youtube.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 10,
        order: 'relevance',
        safeSearch: 'strict',
        videoEmbeddable: true,
        relevanceLanguage: 'en',
        videoDuration: 'medium'
      });

      if (response.data.items && response.data.items.length > 0) {
        allVideos = allVideos.concat(response.data.items);
      }
    }

    // Filter out potentially irrelevant videos
    const filteredVideos = allVideos.filter(video => {
      const title = video.snippet.title.toLowerCase();
      const description = video.snippet.description.toLowerCase();
      return !title.includes('#shorts') &&
             !title.includes('tiktok') &&
             !title.includes('meme') &&
             (title.includes(topic.toLowerCase()) || description.includes(topic.toLowerCase())) &&
             (title.includes('learn') || title.includes('tutorial') || title.includes('lesson') || 
              description.includes('learn') || description.includes('tutorial') || description.includes('lesson'));
    });

    // Remove duplicate videos based on video ID
    const uniqueVideos = Array.from(new Set(filteredVideos.map(v => v.id.videoId)))
      .map(id => filteredVideos.find(v => v.id.videoId === id));

    // Shuffle the unique videos to add randomness
    const shuffledVideos = uniqueVideos.sort(() => 0.5 - Math.random());

    const videoLinks = shuffledVideos.slice(0, 5).map(item => {
      return `<li><a href="https://www.youtube.com/watch?v=${item.id.videoId}" target="_blank">${item.snippet.title}</a></li>`;
    });

    return videoLinks.length > 0 ? 
      `<ul>${videoLinks.join('')}</ul>` : 
      '<p>No sufficiently relevant educational videos found for this topic and stage.</p>';

  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
    return `<p>Error fetching video links: ${error.message}</p>`;
  }
}

async function generateBookLinks(topic, grade, stage) {
  try {
    const searchQuery = `${topic} ${grade} ${stage} education`;
    const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
      params: {
        q: searchQuery,
        key: API_KEY,
        maxResults: 5,
        orderBy: 'relevance',
        printType: 'books',
        filter: 'paid-ebooks',
        subject: 'education'
      }
    });

    const bookLinks = response.data.items.map(item => {
      const title = item.volumeInfo.title;
      const link = item.volumeInfo.infoLink;
      const authors = item.volumeInfo.authors ? item.volumeInfo.authors.join(', ') : 'Unknown';
      return `<li><a href="${link}" target="_blank">${title}</a> by ${authors}</li>`;
    });

    return `<ul>${bookLinks.join('')}</ul>`;
  } catch (error) {
    console.error('Error fetching books:', error);
    return '<p>Error fetching book links</p>';
  }
}

async function generateWebsiteLinks(topic, grade, stage) {
  const educationalWebsites = [
    { name: "Khan Academy", url: "https://www.khanacademy.org/search?page_search_query=" },
    { name: "Coursera", url: "https://www.coursera.org/search?query=" },
    { name: "edX", url: "https://www.edx.org/search?q=" },
    { name: "MIT OpenCourseWare", url: "https://ocw.mit.edu/search/?q=" },
    { name: "BBC Bitesize", url: "https://www.bbc.co.uk/bitesize/search?q=" },
    { name: "National Geographic Education", url: "https://education.nationalgeographic.org/resource/?q=" },
    { name: "TED-Ed", url: "https://ed.ted.com/search?qs=" },
    { name: "Smithsonian Learning Lab", url: "https://learninglab.si.edu/search?st=" },
    { name: "PhET Interactive Simulations", url: "https://phet.colorado.edu/en/simulations/filter?sort=alpha&view=grid&q=" },
    { name: "CK-12 Foundation", url: "https://www.ck12.org/search/?q=" }
  ];

  const searchQuery = `${topic} ${grade} ${stage}`;
  const relevantWebsites = educationalWebsites.slice(0, 5).map(website => {
    return `<li><a href="${website.url}${encodeURIComponent(searchQuery)}" target="_blank">${website.name}</a></li>`;
  });

  return `<ul>${relevantWebsites.join('')}</ul>`;
}

async function generateContentContext(topic, grade, stage, contentType) {
  const prompt = `
    Generate a brief introduction (2-3 sentences) for ${contentType} resources about "${topic}" 
    for ${grade} level students, focusing on the stage: "${stage}".
    Explain why these resources are helpful and what students can expect to learn.
  `;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return `<p>${text}</p>`;
  } catch (error) {
    console.error(`Error generating ${contentType} context:`, error);
    return '';
  }
}

async function fetchContent(topic, grade, contentType, stage) {
  let content;
  try {
    switch(contentType) {
      case 'video':
        content = await generateVideoLinks(topic, grade, stage);
        const videoContext = await generateContentContext(topic, grade, stage, 'video');
        content = `
          <h2>Video Resources for ${topic} (${grade} level) - ${stage}</h2>
          ${videoContext}
          ${content}
        `;
        break;
      case 'books':
        content = await generateBookLinks(topic, grade, stage);
        const bookContext = await generateContentContext(topic, grade, stage, 'book');
        content = `
          <h2>Books for ${topic} (${grade} level) - ${stage}</h2>
          ${bookContext}
          ${content}
        `;
        break;
      case 'websites':
        content = await generateWebsiteLinks(topic, grade, stage);
        content = `
          <h2>Useful Websites for ${topic} (${grade} level) - ${stage}</h2>
          <p>These links will take you to search results for the topic on various educational platforms:</p>
          ${content}
        `;
        break;
      case 'ai-notes':
        content = await generateAINotes(topic, grade, stage);
        content = `
          <h2>AI-generated Notes for ${topic} (${grade} level) - ${stage}</h2>
          <div class="ai-content">${content}</div>
        `;
        break;
      case 'ai-questions':
        content = await generateAIQuestions(topic, grade);
        content = `
          <h2>AI-generated Questions for ${topic} (${grade} level)</h2>
          <div class="ai-content">${content}</div>
        `;
        break;
      default:
        content = `<p>Content type ${contentType} is not supported yet.</p>`;
    }
  } catch (error) {
    console.error(`Error generating ${contentType} content:`, error);
    content = `<p>Error generating ${contentType} content: ${error.message}. Please try again.</p>`;
  }
  return `<div class="content-wrapper">${content}</div>`;
}

// Modified API routes
app.get('/initiate-content-generation', async (req, res) => {
  const { topic, grade, type, stage } = req.query;
  if (!topic || !grade || !type || !stage) {
    return res.status(400).send('Topic, grade, content type, and stage are required.');
  }
  const taskId = `${type}_${Date.now()}`;
  cache.set(taskId, 'pending', 300); // Set initial status as pending, expire in 5 minutes
  
  // Start the content generation process asynchronously
  generateContent(taskId, topic, grade, type, stage).catch(console.error);
  
  res.json({ taskId });
});

app.get('/check-content-status', (req, res) => {
  const { taskId } = req.query;
  if (!taskId) {
    return res.status(400).send('Task ID is required.');
  }
  const status = cache.get(taskId);
  if (!status) {
    return res.status(404).send('Task not found or expired.');
  }
  if (status === 'pending') {
    return res.json({ status: 'pending' });
  }
  res.json({ status: 'completed', content: status });
});

async function generateContent(taskId, topic, grade, type, stage) {
  try {
    const content = await fetchContent(topic, grade, type, stage);
    cache.set(taskId, content);
  } catch (error) {
    console.error(`Error generating content for task ${taskId}:`, error);
    cache.set(taskId, `<p>Error generating content: ${error.message}. Please try again.</p>`);
  }
}

app.get('/study-pathway', async (req, res) => {
  const { topic, grade } = req.query;
  if (!topic || !grade) {
    return res.status(400).send('Topic and grade are required.');
  }
  try {
    const pathway = await generateStudyPathway(topic, grade);
    res.send(pathway);
  } catch (error) {
    console.error('Error in /study-pathway:', error);
    res.status(500).send(`Error generating study pathway: ${error.message}`);
  }
});

// Catch-all route to serve index.html for any unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;