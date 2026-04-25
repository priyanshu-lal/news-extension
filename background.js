// Background service worker - handles API calls and communication

const CONFIG = {
    LLM_API_KEY: 'undefined',
    LLM_API_ENDPOINT: 'undefined',
    MODEL_NAME: 'undefined',
    SEARCH_API_KEY: 'undefined',
    SEARCH_API_ENDPOINT: 'undefined',
    SEARCH_API_CX_ID: 'undefined'
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action);
    handleMessage(request, sender)
        .then(response => sendResponse(response))
        .catch(error => {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        });
    return true;
});

/**
 * Main message handler
 */
async function handleMessage(request, sender) {
    const { action, data } = request;
    switch (action) {
        case 'checkIfNews':
            return await checkIfNews(data.title, data.content);
        
        case 'generateSummary':
            return await generateSummary(data.title, data.content, data.type);
        
        case 'analyzeBias':
            return await analyzeBias(data.title, data.content);
        
        case 'askQuestion':
            return await askQuestion(data.title, data.content, data.question, data.history);
        
        default:
            throw new Error('Unknown action: ' + action);
    }
}

/**
 * Check if the page content is news
 */
async function checkIfNews(title, contentData) {
    // return {
    //     isNews: true,
    //     confidence: "high",
    //     category: "politics",
    //     reasoning: "brief explanation",
    // };
    try {
        const prompt = `You are a news article detector.
A news article typically:
- Reports on recent events, developments, or happenings
- Includes factual information about real-world events
- May cover topics like politics, sports, entertainment, business, technology, science, etc.
- Has a journalistic structure (headline, lead paragraph, body)

NOT news articles:
- Blog posts about personal experiences
- Product pages or shopping sites
- Social media posts
- How-to guides or tutorials
- Entertainment content (unless reporting on entertainment news)
- Academic papers or research articles (unless reporting on research findings)

Respond in JSON format:
{
    "isNews": true/false,
    "confidence": "high/medium/low",
    "category": "politics/sports/entertainment/technology/business/science/other",
    "reasoning": "brief explanation"
}

Analyze the following webpage content and determine if it's a news article:

Title: ${title}
Meta Description: ${contentData.metaDescription}
Content Preview: ${contentData.mainContent.substring(0, 1000)}`;

        const response = await callLLMAPI(prompt); // Use faster model for detection
        const result = parseJSONResponse(response);
        
        return {
            isNews: result.isNews,
            confidence: result.confidence,
            category: result.category,
            reasoning: result.reasoning
        };
    }
    catch (error) {
        console.error('Error checking if news:', error);
        // Fallback: simple heuristic check
        return fallbackNewsCheck(title, contentData);
    }
}

/**
 * Generate unbiased summary from multiple sources
 */
async function generateSummary(title, contentData, type) {
    try {
        const relatedArticles = await searchRelatedArticles(title);
        const isDetailed = type === 'detailed';
        
        const prompt = `You are a news summarization expert.
Instructions:
- Provide an ${isDetailed ? 'in-depth' : 'concise'} summary that synthesizes information from multiple perspectives
- Remain completely neutral and unbiased
- ${isDetailed ? 'Include key details, context, and different viewpoints' : 'Focus on the main facts and key points'}
- Highlight any controversies or differing opinions objectively
- ${isDetailed ? 'Aim for 300-500 words' : 'Keep it under 150 words'}
- Give response in the form of HTML with a little bit of CSS for styling, so that your response could directly be rendered as HTML
- Give response in the same language in which the news is written in.

Now create a ${isDetailed ? 'DETAILED' : 'QUICK'} unbiased summary of the following news topic:

Original Article:

TITLE: ${title}
CONTENT:
${contentData.mainContent}

Related Articles Found:
${relatedArticles.map((article, idx) => 
    `${idx + 1}. ${article.title}\n   Source: ${article.source}\n   Snippet: ${article.snippet}`
).join('\n\n')}`;

        const summaryContent = await callLLMAPI(prompt);
        const sourcesHTML = buildSourcesHTML(relatedArticles);
        return {
            summary: `
                <div style="line-height: 1.8;">
                    ${summaryContent}
                    ${sourcesHTML}
                </div>
            `
        };
    }
    catch (error) {
        console.error('Error generating summary:', error);
        throw error;
    }
}

/**
 * Analyze article for bias
 */
async function analyzeBias(title, contentData) {
    try {
        const prompt = `You are a media bias analysis expert. Your task is to analyze news articles.

Analyze for:
1. Word choice and loaded language
2. Source selection and omissions
3. Framing and presentation
4. Balance of perspectives
5. Emotional manipulation
6. Political leaning (if any)

Provide a detailed analysis in HTML format with:
- Overall bias rating (Minimal/Low/Moderate/High)
- Specific examples of biased content (if any)
- What perspectives might be missing
- Suggestions for more balanced coverage
- Political leaning assessment (Left/Center/Right/Mixed)

Now analyze the following news article for potential bias \
and only give response in the form of HTML which could be directly rendered on a webpage:

TITLE: ${title}

CONTENT:
${contentData.mainContent}`;

        const analysis = await callLLMAPI(prompt);
        return {
            analysis: `<div style="line-height: 1.8;">${analysis}</div>`
        };
    }
    catch (error) {
        console.error('Error analyzing bias:', error);
        throw error;
    }
}

/**
 * Answer questions about the news article
 */
async function askQuestion(title, contentData, question, history) {
    try {
        // building conversation context
        const conversationContext = history.length > 0 ? history.map(item => 
            `User: ${item.question}\nAssistant: ${item.answer}`).join('\n\n') : '';

        const prompt = `You are a helpful assistant answering questions about a news article.

Article Title: ${title}
Article Content: ${contentData.mainContent}

Previous Conversation:
${conversationContext}

User Question: ${question}

Provide a clear, informative answer based on the article content. If the question cannot be answered from the article, say so and provide context if possible. Keep your response conversational and concise.`;

        const answer = await callLLMAPI(prompt, null, 0.7);
        return { answer };
    }
    catch (error) {
        console.error('Error answering question:', error);
        throw error;
    }
}

/**
 * Search for related articles
 */
async function searchRelatedArticles(title) {
    try {
        // Extract key terms from title
        const searchQuery = title.replace(/[^\w\s]/g, '').trim();
        console.log(`Google Search for "${title}"`);
        //const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery + ' news')}&format=json`;
        const url = `${CONFIG.SEARCH_API_ENDPOINT}?key=${CONFIG.SEARCH_API_KEY}&cx=${CONFIG.SEARCH_API_CX_ID}&q=${encodeURIComponent(searchQuery + 'news')}`;
        const response = await fetch(url);
        const data = await response.json();
        console.log("Response from google:", data);
        
        const results = [];        
        if (data.items && Array.isArray(data.items)) {
            for (const topic of data.items) {
                results.push({
                    title: topic.title,
                    url: topic.link,
                    source: topic.displayLink,
                    snippet: topic.snippet
                });
            }
        }
        
        // Fallback: create mock results if no results found
        // if (results.length === 0) {
        //     results.push({
        //         title: 'Related coverage from original source',
        //         url: '#',
        //         source: 'Original Article',
        //         snippet: 'Multiple sources are covering this story'
        //     });
        // }
        return results;
    }
    catch (error) {
        console.error('Error searching articles:', error);
        // Return empty array on error
        return [];
    }
}

/**
 * Calls LLM API
 */
async function callLLMAPI(prompt, model = null, temperature = 0.3) {
    try {
        const modelToUse = model || CONFIG.MODEL_NAME;
        const url = `${CONFIG.LLM_API_ENDPOINT}${modelToUse}:generateContent?key=${CONFIG.LLM_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: 2000
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }
    catch (error) {
        console.error('Gemini API Error:', error);
        throw error;
    }
}

/**
 * Helper: Parse JSON from LLM response
 */
function parseJSONResponse(response) {
    try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
            response.match(/```\n([\s\S]*?)\n```/);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        }
        // Try to parse directly
        return JSON.parse(response);
    }
    catch (error) {
        console.error('Error parsing JSON:', error);
        throw new Error('Failed to parse response');
    }
}

/**
 * Helper: Build sources HTML
 */
function buildSourcesHTML(articles) {
    if (articles.length === 0) return '';
    const sourcesList = articles
        .map(article => `<a href="${article.url}" class="source-link" target="_blank">📰 ${article.title} (${article.source})</a>`)
        .join('');
    
    return `
        <div class="sources" style="margin-top: 24px; padding: 16px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #667eea;">
            <h4 style="color: #2d3748; font-size: 14px; margin-bottom: 12px;">📚 Sources</h4>
            ${sourcesList}
        </div>
    `;
}

/**
 * Fallback news detection using simple heuristics
 */
function fallbackNewsCheck(title, contentData) {
    const newsKeywords = [
        'breaking', 'reports', 'announced', 'according to', 'sources',
        'officials', 'statement', 'press release', 'news', 'update'
    ];
    const content = (title + ' ' + contentData.mainContent).toLowerCase();
    const hasNewsKeywords = newsKeywords.some(keyword => content.includes(keyword));
    const hasDate = contentData.publishDate !== '';
    const hasSubstantialContent = contentData.mainContent.length > 500;
    const isNews = (hasNewsKeywords || hasDate) && hasSubstantialContent;
    return {
        isNews,
        confidence: 'low',
        category: 'other',
        reasoning: 'Determined using fallback heuristics'
    };
}
