const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require('googleapis');
const axios = require('axios');
const NodeCache = require('node-cache');
const multer = require('multer');
const pdf = require('pdf-parse');
const cors = require('cors');
const createWorker = require('tesseract.js').createWorker;
const sharp = require('sharp');

// Environment variables with defaults
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 50 * 1024 * 1024; // 50MB default
const UPLOAD_TIMEOUT = process.env.UPLOAD_TIMEOUT || 300000; // 5 minutes
const CHUNK_SIZE = process.env.CHUNK_SIZE || 5 * 1024 * 1024; // 5MB chunks

const app = express();

// Configure Express with increased limits
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const cache = new NodeCache({ stdTTL: 3600 }); 

const API_KEY = "AIzaSyBLvP6wb7dV3myixOOb5lqZLFm5ePrdP6U";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const youtube = google.youtube({
    version: 'v3',
    auth: API_KEY
});

// Configure multer with enhanced settings
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Add timeout middleware
const timeoutMiddleware = (req, res, next) => {
    res.setTimeout(UPLOAD_TIMEOUT, () => {
        res.status(408).json({ 
            error: 'Request timeout', 
            message: 'The upload took too long to complete' 
        });
    });
    next();
};

// OCR Functions
async function extractTextFromImage(imageBuffer) {
    const worker = await createWorker();
    try {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(imageBuffer);
        await worker.terminate();
        return text;
    } catch (error) {
        console.error('OCR Error:', error);
        throw error;
    }
}

async function processPageImage(pageData) {
    try {
        const image = await sharp(pageData).toBuffer();
        return await extractTextFromImage(image);
    } catch (error) {
        console.error('Image processing error:', error);
        return '';
    }
}

// PDF Upload endpoint
app.post('/upload-pdf', timeoutMiddleware, function(req, res) {
    upload.single('pdf')(req, res, async function(err) {
        console.log('Upload request received');

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ 
                    error: 'File too large', 
                    maxSize: MAX_FILE_SIZE,
                    maxSizeMB: MAX_FILE_SIZE / (1024 * 1024),
                    message: `Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
                });
            }
            console.error('Multer error:', err);
            return res.status(400).json({ error: `File upload error: ${err.message}` });
        } else if (err) {
            console.error('Unknown error:', err);
            return res.status(500).json({ error: `Unknown error: ${err.message}` });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log('File received:', {
                filename: req.file.originalname,
                size: req.file.size,
                sizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + 'MB',
                mimetype: req.file.mimetype
            });

            if (req.file.size === 0) {
                return res.status(400).json({ error: 'Empty file uploaded' });
            }

            // Process the PDF
            const fileBuffer = req.file.buffer;
            let extractedText = '';
            let numPages = 0;

            try {
                // Try standard PDF text extraction first
                const pdfData = await pdf(fileBuffer);
                extractedText = pdfData.text;
                numPages = pdfData.numpages;

                // If no text was extracted, try OCR
                if (!extractedText || extractedText.trim().length === 0) {
                    console.log('No machine-readable text found, attempting OCR...');
                    const pages = await pdf(fileBuffer);
                    const ocrPromises = Array.from({ length: pages.numpages }, (_, i) => {
                        return processPageImage(pages[i]);
                    });
                    const ocrResults = await Promise.all(ocrPromises);
                    extractedText = ocrResults.join('\n');
                }

                if (!extractedText || extractedText.trim().length === 0) {
                    throw new Error('No text content could be extracted from the PDF');
                }

                const summaryPrompt = `
                    Analyze this educational content and provide a response in this exact JSON format:
                    {
                        "topic": "specific topic name",
                        "grade": "academic level",
                        "subtopics": ["list", "of", "subtopics"],
                        "mainConcepts": ["main", "concepts", "covered"]
                    }

                    Content to analyze:
                    "${extractedText.substring(0, 1500)}"

                    Note: Grade should be one of: Elementary/Middle School/High School/College
                `;

                const result = await model.generateContent(summaryPrompt);
                const response = await result.response;
                const responseText = response.text();

                try {
                    const analysis = JSON.parse(responseText);
                    analysis.textPreview = extractedText.substring(0, 200);
                    analysis.numPages = numPages;
                    analysis.fileSize = req.file.size;
                    analysis.fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

                    console.log('Analysis completed:', {
                        topic: analysis.topic,
                        grade: analysis.grade,
                        pages: analysis.numPages,
                        size: analysis.fileSizeMB + 'MB'
                    });

                    res.json(analysis);
                } catch (parseError) {
                    console.error('Failed to parse AI response:', parseError);
                    
                    const fallbackAnalysis = {
                        topic: extractedText.match(/^([^\n.!?]+)/)?.[1]?.trim() || "Unknown Topic",
                        grade: "College",
                        subtopics: [],
                        mainConcepts: [],
                        textPreview: extractedText.substring(0, 200),
                        numPages: numPages,
                        fileSize: req.file.size,
                        fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2)
                    };

                    res.json(fallbackAnalysis);
                }

            } catch (pdfError) {
                console.error('PDF processing error:', pdfError);
                throw new Error(`Failed to process PDF file: ${pdfError.message}`);
            }

        } catch (error) {
            console.error('Error processing upload:', error);
            res.status(500).json({ 
                error: 'Error processing PDF file',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });
});

async function generateStudyPathwayStage(topic, grade, stageNumber) {
    const prompt = `
        Analyze and generate Stage ${stageNumber} of a study pathway for "${topic}" at "${grade}" level.
        
        First, quickly assess (do not include this analysis in output):
        1. Topic complexity (consider prerequisites, abstract concepts, technical terms)
        2. Grade-appropriate depth
        3. Required background knowledge
        4. Practical application potential
        
        Then generate the stage content following this structure:
        <h2>Stage ${stageNumber}: [Create a clear stage title showing progression]</h2>
        
        <h3>Foundational Skills</h3>
        <ul>
        - Include 2-5 skills based on topic complexity
        - Use <b>tags</b> for key terms
        - Skills must be measurable and grade-appropriate
        - Consider previous stage knowledge
        </ul>
        
        <h3>Core Topics</h3>
        <ul>
        - Include 2-5 topics based on complexity
        - Use <b>tags</b> for important terms
        - Topics should show clear progression
        - Match ${grade} level understanding
        </ul>
        
        <h3>Learning Activities</h3>
        <ul>
        - Include 2-4 activities
        - Mix theoretical and practical tasks
        - Scale difficulty to topic and grade
        - Include collaborative and individual work
        </ul>

        Guidelines:
        - Adapt content depth to topic complexity
        - Use grade-appropriate language
        - Ensure natural learning progression
        - Keep response under 500 characters
        - Maintain exact HTML formatting
        - Make content specific to ${topic}

        If Stage 1: Focus on foundations
        If Stage 2: Build core concepts
        If Stage 3: Advanced application
        
        Ensure all content directly relates to ${topic} and ${grade} level.
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
        Ensure the notes are tailored to the current stage of learning.
        Format the notes with HTML, using appropriate tags like <h3> for subtopics, <p> for paragraphs, and <ul> or <ol> for lists.
        Use <b> tags to highlight important terms or concepts.
        Limit the response to around 500 words.
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

    } catch (error) {console.error('Error fetching YouTube videos:', error);
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

app.get('/initiate-content-generation', async (req, res) => {
    const { topic, grade, type, stage } = req.query;
    if (!topic || !grade || !type || !stage) {
        return res.status(400).send('Topic, grade, content type, and stage are required.');
    }
    const taskId = `${type}_${Date.now()}`;
    cache.set(taskId, 'pending', 3600); 
    
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
        res.status(500).send('Error generating study pathway. Please try again.');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Maximum file size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        console.log(`Upload timeout: ${UPLOAD_TIMEOUT / 1000} seconds`);
    });
}

module.exports = a