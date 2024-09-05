const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require('googleapis');
const axios = require('axios');

const API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY
});

async function generateAINotes(topic, grade) {
  const prompt = `
      Generate concise and informative study notes for the topic "${topic}" at the "${grade}" level. 
      Include key concepts, definitions, and important points. 
      Format the notes with HTML, using appropriate tags like <h3> for subtopics, <p> for paragraphs, and <ul> or <ol> for lists.
      Limit the response to around 500 words.
      Example format:
      <h3>Subtopic 1</h3>
      <p>Brief explanation of the subtopic.</p>
      <ul>
          <li>Key point 1</li>
          <li>Key point 2</li>
      </ul>
      <h3>Subtopic 2</h3>
      <p>Another explanation...</p>
  `;
  try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = await response.text();
      return text;
  } catch (error) {
      console.error('Error generating AI notes:', error);
      return '<p>Error generating AI notes. Please try again.</p>';
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

    const uniqueVideos = Array.from(new Set(filteredVideos.map(v => v.id.videoId)))
      .map(id => filteredVideos.find(v => v.id.videoId === id));

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
  const prompt = `
    Generate 5 website titles and URLs for the topic "${topic}" at the "${grade}" level, 
    focusing on the stage: "${stage}".
    Include educational websites, online resources, and interactive learning platforms.
    Format the response as an HTML unordered list with each item as a link.
    Example format:
    <ul>
      <li><a href="https://www.example1.com">Website Title 1</a></li>
      <li><a href="https://www.example2.com">Website Title 2</a></li>
    </ul>
  `;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Error generating website links:', error);
    return '<p>Error generating website links</p>';
  }
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
        <p>Note: These are AI-generated suggestions. Links may not be accurate or may lead to unrelated content.</p>
        ${content}
      `;
      break;
    case 'ai-notes':
      content = await generateAINotes(topic, grade);
      content = `
          <h2>AI-generated Notes for ${topic} (${grade} level)</h2>
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
  return `<div class="content-wrapper">${content}</div>`;
}

module.exports = async (req, res) => {
  const { topic, grade, type, stage } = req.query;
  if (!topic || !grade || !type || !stage) {
    return res.status(400).json({ error: 'Topic, grade, content type, and stage are required.' });
  }
  try {
    const content = await fetchContent(topic, grade, type, stage);
    res.status(200).json({ content });
  } catch (error) {
    console.error('Error in /generate-content:', error);
    res.status(500).json({ error: `Error fetching content: ${error.message}` });
  }
};