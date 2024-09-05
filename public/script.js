document.addEventListener('DOMContentLoaded', () => {
    const topicForm = document.getElementById('topic-form');
    const gradeSection = document.getElementById('grade-section');
    const pathwaySection = document.getElementById('pathway-section');
    const outputSection = document.getElementById('output-section');
    const loader = document.getElementById('loader');

    let currentTopic = '';
    let currentGrade = '';

    function showLoader() {
        loader.style.display = 'flex';
    }

    function hideLoader() {
        loader.style.display = 'none';
    }

    topicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        currentTopic = document.getElementById('topic').value;
        currentGrade = document.getElementById('grade').value;
        try {
            if (currentGrade) {
                await generatePathway();
            } else {
                gradeSection.style.display = 'block';
                pathwaySection.style.display = 'none';
                outputSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Error generating pathway:', error);
        } finally {
            hideLoader();
        }
    });

    document.getElementById('pathway-timeline').addEventListener('click', async (e) => {
        if (e.target.classList.contains('content-btn')) {
            showLoader();
            const contentType = e.target.dataset.type;
            const stage = e.target.closest('.timeline-item').querySelector('h3').textContent;
            const contentOutputDiv = e.target.closest('.timeline-item').querySelector('.content-output');
            try {
                const content = await fetchContent(currentTopic, currentGrade, contentType, stage);
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = content;
                
                contentOutputDiv.innerHTML = '';
                contentOutputDiv.appendChild(tempDiv);
            } catch (error) {
                console.error('Error fetching content:', error);
                contentOutputDiv.innerHTML = '<p class="error">Error fetching content. Please try again.</p>';
            } finally {
                hideLoader();
            }
        }
    });

    async function generatePathway() {
        const pathway = await fetchPathway(currentTopic, currentGrade);
        const timelineHTML = createTimelineHTML(pathway);
        document.getElementById('pathway-timeline').innerHTML = timelineHTML;
        gradeSection.style.display = 'none';
        pathwaySection.style.display = 'block';
        outputSection.style.display = 'block';
    }

    async function fetchPathway(topic, grade) {
        const response = await fetch(`/api/study-pathway?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        if (data.includes('Error generating study pathway')) {
            throw new Error(data);
        }
        return data;
    }

    async function fetchContent(topic, grade, contentType, stage) {
        const response = await fetch(`/api/generate-content?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(contentType)}&stage=${encodeURIComponent(stage)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        if (data.includes('Error generating content')) {
            throw new Error(data);
        }
        return data;
    }

    function createTimelineHTML(pathwayContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(pathwayContent, 'text/html');
        const stages = doc.querySelectorAll('h2');
    
        if (stages.length === 0) {
            return '<p>No stages found in the generated pathway. Please try again.</p>';
        }
    
        return Array.from(stages).map((stage, index) => {
            let stageContent = '';
            let currentElement = stage.nextElementSibling;
            
            while (currentElement && currentElement.tagName !== 'H2') {
                stageContent += currentElement.outerHTML;
                currentElement = currentElement.nextElementSibling;
            }
    
            return `
                <div class="timeline-item">
                    <h3>${stage.textContent}</h3>
                    <div class="stage-content">
                        ${stageContent}
                    </div>
                    <div class="content-section">
                        <button class="content-btn" data-type="video">Videos</button>
                        <button class="content-btn" data-type="books">Books</button>
                        <button class="content-btn" data-type="websites">Websites</button>
                        <button class="content-btn" data-type="ai-notes">AI Notes</button>
                        <button class="content-btn" data-type="ai-questions">AI Questions</button>
                    </div>
                    <div class="content-output"></div>
                </div>
            `;
        }).join('');
    }
});