document.addEventListener('DOMContentLoaded', () => {
    const topicForm = document.getElementById('topic-form');
    const pdfUploadForm = document.getElementById('pdf-upload-form');
    const gradeSection = document.getElementById('grade-section');
    const pathwaySection = document.getElementById('pathway-section');
    const outputSection = document.getElementById('output-section');
    const loader = document.getElementById('loader');
    const pdfAnalysisResult = document.getElementById('pdf-analysis-result');

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

 // In script.js - Find the PDF upload form event listener
if (pdfUploadForm) {
    pdfUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        
        const formData = new FormData();
        const pdfFile = document.getElementById('pdf-file').files[0];
        
        if (!pdfFile) {
            hideLoader();
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = '<p class="error">Please select a PDF file.</p>';
            }
            return;
        }

        console.log('Uploading file:', {
            name: pdfFile.name,
            size: pdfFile.size,
            type: pdfFile.type
        });
        
        formData.append('pdf', pdfFile);
        
        try {
            const response = await fetch('/upload-pdf', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            console.log('Server response:', data);

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            
            // Update form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = data.topic || '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = data.grade || '';
            }
            
            // Display detailed analysis result
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = `
                    <div class="analysis-info">
                        <p><strong>Detected Topic:</strong> ${data.topic || 'Not detected'}</p>
                        <p><strong>Academic Level:</strong> ${data.grade || 'Not detected'}</p>
                        ${data.subtopics && data.subtopics.length > 0 ? `
                            <p><strong>Subtopics:</strong></p>
                            <ul>
                                ${data.subtopics.map(subtopic => `<li>${subtopic}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${data.mainConcepts && data.mainConcepts.length > 0 ? `
                            <p><strong>Main Concepts:</strong></p>
                            <ul>
                                ${data.mainConcepts.map(concept => `<li>${concept}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${data.textPreview ? `
                            <div class="text-preview">
                                <p><strong>Text Preview:</strong></p>
                                <p class="preview-content">${data.textPreview}</p>
                            </div>
                        ` : ''}
                        <p><strong>Pages:</strong> ${data.numPages || 'Unknown'}</p>
                    </div>
                `;
            }
            
            // Set current values and generate pathway
            currentTopic = data.topic || '';
            currentGrade = data.grade || '';
            if (currentTopic && currentGrade) {
                await generatePathway();
            }
            
        } catch (error) {
            console.error('Error uploading PDF:', error);
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        } finally {
            hideLoader();
        }
    });
}
    const pathwayTimeline = document.getElementById('pathway-timeline');
    if (pathwayTimeline) {
        pathwayTimeline.addEventListener('click', (e) => {
            if (e.target.classList.contains('content-btn')) {
                e.preventDefault();
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
            showLoader();
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
                pathwayTimelineElement.innerHTML = `
                    <div class="error-message">
                        <p>Sorry, we encountered an error while generating your pathway.</p>
                        <p>Please try again in a few moments.</p>
                        <p class="error-details">Error: ${error.message}</p>
                    </div>
                `;
            }
            if (pathwaySection) pathwaySection.style.display = 'block';
        } finally {
            hideLoader();
        }
    }

    async function fetchPathway(topic, grade) {
        console.log(`Fetching pathway for topic: ${topic}, grade: ${grade}`);
        try {
            const response = await fetch(`/study-pathway?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`, {
                timeout: 8000  // 8 second timeout
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.text();
            console.log('Received pathway data:', data.substring(0, 100) + '...'); 
            
            if (!data || data.includes('Error generating study pathway')) {
                throw new Error(data || 'Empty response received');
            }
            
            return data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw new Error(`Failed to fetch pathway: ${error.message}`);
        }
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
        console.log('Creating timeline from:', pathwayContent);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(pathwayContent, 'text/html');
        const stages = Array.from(doc.querySelectorAll('h2'));
        
        console.log('Found stages:', stages.length);
    
        if (stages.length === 0) {
            console.error('No stages found in pathway content');
            return '<p>No stages found in the generated pathway. Please try again.</p>';
        }
    
        return stages.map((stage, index) => {
            console.log(`Processing stage ${index + 1}:`, stage.textContent);
            
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
    const clearButton = document.getElementById('clear-content');
    
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            // Clear file input
            const fileInput = document.getElementById('pdf-file');
            if (fileInput) {
                fileInput.value = '';
            }

            // Clear analysis result
            const analysisResult = document.getElementById('pdf-analysis-result');
            if (analysisResult) {
                analysisResult.style.display = 'none';
                analysisResult.innerHTML = '';
            }

            // Clear form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = '';
            }

            // Clear pathway section
            const pathwaySection = document.getElementById('pathway-section');
            if (pathwaySection) {
                pathwaySection.style.display = 'none';
            }
            const pathwayTimeline = document.getElementById('pathway-timeline');
            if (pathwayTimeline) {
                pathwayTimeline.innerHTML = '';
            }

            // Reset current values
            currentTopic = '';
            currentGrade = '';

            // Optional: Show confirmation message
            const uploadSection = document.querySelector('.upload-section');
            const message = document.createElement('div');
            message.className = 'clear-message';
            message.textContent = 'Content cleared successfully';
            uploadSection.appendChild(message);

            // Remove message after 3 seconds
            setTimeout(() => {
                message.remove();
            }, 3000);
        });
    }
});