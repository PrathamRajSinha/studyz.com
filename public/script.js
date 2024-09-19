document.addEventListener('DOMContentLoaded', () => {
    const topicForm = document.getElementById('topic-form');
    const gradeSection = document.getElementById('grade-section');
    const pathwaySection = document.getElementById('pathway-section');
    const outputSection = document.getElementById('output-section');
    const loader = document.getElementById('loader');

    let currentTopic = '';
    let currentGrade = '';

    function showLoader() {
        if (loader) {
            loader.style.display = 'flex';
        }
    }

    function hideLoader() {
        if (loader) {
            loader.style.display = 'none';
        }
    }

    if (topicForm) {
        topicForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader();
            currentTopic = document.getElementById('topic')?.value || '';
            currentGrade = document.getElementById('grade')?.value || '';
            try {
                if (currentGrade) {
                    await generatePathway();
                } else if (gradeSection) {
                    gradeSection.style.display = 'block';
                    if (pathwaySection) pathwaySection.style.display = 'none';
                    if (outputSection) outputSection.style.display = 'none';
                }
            } catch (error) {
                console.error('Error generating pathway:', error);
                alert(`An error occurred while generating the pathway: ${error.message}`);
            } finally {
                hideLoader();
            }
        });
    }

    const pathwayTimeline = document.getElementById('pathway-timeline');
    if (pathwayTimeline) {
        pathwayTimeline.addEventListener('click', (e) => {
            if (e.target.classList.contains('content-btn')) {
                e.preventDefault(); // Prevent default button behavior
                const contentType = e.target.dataset.type;
                const stage = e.target.closest('.timeline-item')?.querySelector('h3')?.textContent || '';
                const contentOutputDiv = e.target.closest('.timeline-item')?.querySelector('.content-output');
                if (contentOutputDiv) {
                    showLoader();
                    fetchContent(currentTopic, currentGrade, contentType, stage, contentOutputDiv)
                        .catch(error => {
                            console.error('Error fetching content:', error);
                            contentOutputDiv.innerHTML = '<p class="error">Error fetching content. Please try again.</p>';
                        })
                        .finally(hideLoader);
                }
            }
        });
    }

    async function generatePathway() {
        try {
            const pathway = await fetchPathway(currentTopic, currentGrade);
            const timelineHTML = createTimelineHTML(pathway);
            const pathwayTimelineElement = document.getElementById('pathway-timeline');
            if (pathwayTimelineElement) {
                pathwayTimelineElement.innerHTML = timelineHTML;
            }
            if (gradeSection) gradeSection.style.display = 'none';
            if (pathwaySection) pathwaySection.style.display = 'block';
            if (outputSection) outputSection.style.display = 'block';
        } catch (error) {
            console.error('Error generating pathway:', error);
            const pathwayTimelineElement = document.getElementById('pathway-timeline');
            if (pathwayTimelineElement) {
                pathwayTimelineElement.innerHTML = `<p class="error">Error generating pathway: ${error.message}. Please try again later.</p>`;
            }
            if (pathwaySection) pathwaySection.style.display = 'block';
        }
    }

    async function fetchPathway(topic, grade) {
        console.log(`Fetching pathway for topic: ${topic}, grade: ${grade}`);
        const response = await fetch(`/study-pathway?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        console.log('Received pathway data:', data.substring(0, 100) + '...'); // Log first 100 characters
        if (data.includes('Error generating study pathway')) {
            throw new Error(data);
        }
        return data;
    }

    async function fetchContent(topic, grade, contentType, stage, contentOutputDiv) {
        try {
            const initiateResponse = await fetch(`/initiate-content-generation?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(contentType)}&stage=${encodeURIComponent(stage)}`);
            if (!initiateResponse.ok) {
                throw new Error(`HTTP error! status: ${initiateResponse.status}`);
            }
            const { taskId } = await initiateResponse.json();

            let content = await pollContent(taskId);
            contentOutputDiv.innerHTML = content;
        } catch (error) {
            console.error('Error fetching content:', error);
            contentOutputDiv.innerHTML = '<p class="error">Error fetching content. Please try again.</p>';
        }
    }

    async function pollContent(taskId, maxAttempts = 30, interval = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                const statusResponse = await fetch(`/check-content-status?taskId=${taskId}`);
                if (!statusResponse.ok) {
                    throw new Error(`HTTP error! status: ${statusResponse.status}`);
                }
                const status = await statusResponse.json();
                if (status.status === 'completed') {
                    return status.content;
                }
            } catch (error) {
                console.error('Error polling content:', error);
            }
        }
        throw new Error('Content generation timed out. Please try again.');
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