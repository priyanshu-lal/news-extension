// State management
const AppState = {
    currentView: 'initial',
    isNews: false,
    pageContent: null,
    pageTitle: null,
    pageUrl: null,
    summaryType: null,
    summary: null,
    chatHistory: []
};

// View management
const Views = {
    INITIAL: 'initialState',
    LOADING: 'loadingState',
    NOT_NEWS: 'notNewsState',
    FEATURES: 'featuresView',
    SUMMARY_SELECTION: 'summarySelection',
    RESULTS: 'resultsView',
    QA: 'qaView'
};

// DOM elements
const elements = {
    // Views
    initialState: document.getElementById('initialState'),
    loadingState: document.getElementById('loadingState'),
    notNewsState: document.getElementById('notNewsState'),
    featuresView: document.getElementById('featuresView'),
    summarySelection: document.getElementById('summarySelection'),
    resultsView: document.getElementById('resultsView'),
    qaView: document.getElementById('qaView'),
    
    // Buttons
    analyzeBtn: document.getElementById('analyzeBtn'),
    retryBtn: document.getElementById('retryBtn'),
    summaryCard: document.getElementById('summaryCard'),
    biasCard: document.getElementById('biasCard'),
    questionCard: document.getElementById('questionCard'),
    quickSummaryBtn: document.getElementById('quickSummaryBtn'),
    detailedSummaryBtn: document.getElementById('detailedSummaryBtn'),
    sendQuestionBtn: document.getElementById('sendQuestionBtn'),
    saveBtn: document.getElementById('saveBtn'),
    
    // Back buttons
    backFromSummary: document.getElementById('backFromSummary'),
    backFromResults: document.getElementById('backFromResults'),
    backFromQA: document.getElementById('backFromQA'),
    
    // Content areas
    loadingText: document.getElementById('loadingText'),
    resultsContent: document.getElementById('resultsContent'),
    chatContainer: document.getElementById('chatContainer'),
    questionInput: document.getElementById('questionInput'),
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.querySelector('.status-text')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    showView(Views.INITIAL);
});

function handleSaveBtn() {
    html2pdf().from(`<h3>${AppState.pageTitle}</h3>${AppState.summary}`).save("document.pdf");
}

// Event listeners
function initializeEventListeners() {
    // Main action buttons
    elements.analyzeBtn.addEventListener('click', handleAnalyzePage);
    elements.retryBtn.addEventListener('click', handleRetry);
    //elements.saveBtn.addEventListener('click', handleSaveBtn);
    
    // Feature cards
    elements.summaryCard.querySelector('.btn-feature').addEventListener('click', handleSummaryClick);
    elements.biasCard.querySelector('.btn-feature').addEventListener('click', handleBiasClick);
    elements.questionCard.querySelector('.btn-feature').addEventListener('click', handleQuestionClick);
    
    // Summary type selection
    elements.quickSummaryBtn.addEventListener('click', () => handleSummaryTypeSelection('quick'));
    elements.detailedSummaryBtn.addEventListener('click', () => handleSummaryTypeSelection('detailed'));
    
    // Back buttons
    elements.backFromSummary.addEventListener('click', () => showView(Views.FEATURES));
    elements.backFromResults.addEventListener('click', () => showView(Views.FEATURES));
    elements.backFromQA.addEventListener('click', () => showView(Views.FEATURES));
    
    // Q&A
    elements.sendQuestionBtn.addEventListener('click', handleSendQuestion);
    elements.questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendQuestion();
        }
    });
}

// View management functions
function showView(viewId) {
    Object.values(Views).forEach(view => {
        const element = document.getElementById(view);
        if (element) {
            element.classList.add('hidden');
        }
    });
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        AppState.currentView = viewId;
    }
}

function updateStatus(text, isActive = true) {
    elements.statusText.textContent = text;
    const statusDot = document.querySelector('.status-dot');
    if (isActive) {
        statusDot.style.background = '#48bb78';
    }
    else {
        statusDot.style.background = '#f56565';
    }
}

// Handler functions
async function handleAnalyzePage() {
    try {
        showView(Views.LOADING);
        updateStatus('Analyzing...');
        elements.loadingText.textContent = 'Extracting page content...';
        
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }
        
        AppState.pageUrl = tab.url;
        AppState.pageTitle = tab.title;
        
        elements.loadingText.textContent = 'Reading page content...';
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
        console.log("CONTENT:", response)
        if (!response || !response.success) {
            throw new Error('Failed to extract content');
        }
        
        AppState.pageContent = response.content;
        
        elements.loadingText.textContent = 'Analyzing with AI...';
        const isNewsResult = await checkIfNews(AppState.pageTitle, AppState.pageContent);
        
        if (isNewsResult.isNews) {
            AppState.isNews = true;
            updateStatus('Ready');
            showView(Views.FEATURES);
        } else {
            AppState.isNews = false;
            updateStatus('Not News', false);
            showView(Views.NOT_NEWS);
        }
    } catch (error) {
        console.error('Error analyzing page:', error);
        updateStatus('Error', false);
        alert('Error analyzing page: ' + error.message);
        showView(Views.INITIAL);
    }
}

function handleRetry() {
    AppState.isNews = false;
    AppState.pageContent = null;
    AppState.pageTitle = null;
    updateStatus('Ready');
    showView(Views.INITIAL);
}

function handleSummaryClick() {
    showView(Views.SUMMARY_SELECTION);
}

async function handleBiasClick() {
    try {
        showView(Views.LOADING);
        updateStatus('Analyzing...');
        elements.loadingText.textContent = 'Checking for bias in the article...';
        const biasAnalysis = await analyzeBias(AppState.pageTitle, AppState.pageContent);
        displayResults('Bias Analysis', biasAnalysis);
        updateStatus('Ready');
        showView(Views.RESULTS);
    }
    catch (error) {
        console.error('Error analyzing bias:', error);
        alert('Error analyzing bias: ' + error.message);
        showView(Views.FEATURES);
    }
}

function handleQuestionClick() {
    AppState.chatHistory = [];
    elements.chatContainer.innerHTML = '<p style="color: #A89E97; text-align: center; padding: 20px;">Ask me anything about this news article!</p>';
    showView(Views.QA);
}

async function handleSummaryTypeSelection(type) {
    try {
        AppState.summaryType = type;
        showView(Views.LOADING);
        updateStatus('Generating...');
        elements.loadingText.textContent = `Searching for related articles...`;
        
        // Generate summary
        AppState.summary = await generateSummary(
            AppState.pageTitle,
            AppState.pageContent,
            type
        );

        // html2pdf().from(
        //     `<h3 style="text-align: center; font-size: 25px; border-bottom: 2px solid #222; padding-bottom: 10px; margin: 40px;">
        //     ${AppState.pageTitle}</h3>
        //     <div style="font-family: 'Times New Roman', serif; font-size: 18px; margin: 40px; color: #222; background-color: #fff;">
        //         ${AppState.summary}
        //     </div>`)
        //     .save("document.pdf");

        displayResults(type === 'quick' ? 'Quick Summary' : 'Detailed Summary', AppState.summary);
        updateStatus('Ready');
        showView(Views.RESULTS);
    }
    catch (error) {
        console.error('Error generating summary:', error);
        alert('Error generating summary: ' + error.message);
        showView(Views.SUMMARY_SELECTION);
    }
}

async function handleSendQuestion() {
    const question = elements.questionInput.value.trim();
    
    if (!question) return;
    
    // Add user message to chat
    addChatMessage(question, 'user');
    elements.questionInput.value = '';
    
    try {
        // Add thinking indicator
        const thinkingId = addThinkingIndicator();
        
        // Get answer
        const answer = await askQuestion(
            AppState.pageTitle,
            AppState.pageContent,
            question,
            AppState.chatHistory
        );
        
        // Remove thinking indicator and add response
        removeThinkingIndicator(thinkingId);
        addChatMessage(answer, 'assistant');
        
        // Update chat history
        AppState.chatHistory.push({ question, answer });
        
    }
    catch (error) {
        console.error('Error getting answer:', error);
        removeThinkingIndicator();
        addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
    }
}

// UI helper functions
function addChatMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;
    
    messageDiv.appendChild(bubbleDiv);
    elements.chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function addThinkingIndicator() {
    const thinkingId = 'thinking-' + Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message assistant';
    messageDiv.id = thinkingId;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.innerHTML = '<div style="display: flex; gap: 4px;"><span style="animation: pulse 1.4s infinite;">●</span><span style="animation: pulse 1.4s infinite 0.2s;">●</span><span style="animation: pulse 1.4s infinite 0.4s;">●</span></div>';
    
    messageDiv.appendChild(bubbleDiv);
    elements.chatContainer.appendChild(messageDiv);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    
    return thinkingId;
}

function removeThinkingIndicator(thinkingId) {
    if (thinkingId) {
        const element = document.getElementById(thinkingId);
        if (element) {
            element.remove();
        }
    }
}

function displayResults(title, content) {
    elements.resultsContent.innerHTML = `
        <h3>${title}</h3>
        ${content}
    `;
}

// API communication functions
async function checkIfNews(title, content) {
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
        action: 'checkIfNews',
        data: { title, content }
    });
    return response;
}

async function generateSummary(title, content, type) {
    const response = await chrome.runtime.sendMessage({
        action: 'generateSummary',
        data: { title, content, type }
    });
    //html2pdf().from(`<h3>${title}</h3>${response.summary}`).save("document.pdf");
    return response.summary;
}

async function analyzeBias(title, content) {
    const response = await chrome.runtime.sendMessage({
        action: 'analyzeBias',
        data: { title, content }
    });
    return response.analysis;
}

async function askQuestion(title, content, question, history) {
    const response = await chrome.runtime.sendMessage({
        action: 'askQuestion',
        data: { title, content, question, history }
    });
    return response.answer;
}

// Utility functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}