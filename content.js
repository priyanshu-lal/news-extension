// Content script - runs on web pages to extract content

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        try {
            const content = extractPageContent();
            sendResponse({ success: true, content: content });
        } catch (error) {
            console.error('Error extracting content:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true; // Keep message channel open for async response
});

/**
 * Extract meaningful content from the current page
 * Prioritizes article content and filters out navigation, ads, etc.
 */
function extractPageContent() {
    const extractedData = {
        title: document.title,
        url: window.location.href,
        mainContent: '',
        metaDescription: '',
        publishDate: '',
        author: '',
        headings: [],
        paragraphs: [],
        images: []
    };

    // Extract meta description
    const metaDesc = document.querySelector('meta[name="description"]') || 
                     document.querySelector('meta[property="og:description"]');
    if (metaDesc) {
        extractedData.metaDescription = metaDesc.getAttribute('content') || '';
    }

    // Extract publish date
    const dateSelectors = [
        'meta[property="article:published_time"]',
        'meta[name="publish-date"]',
        'meta[name="date"]',
        'time[datetime]',
        '.publish-date',
        '.article-date',
        '.post-date'
    ];

    for (const selector of dateSelectors) {
        const dateElement = document.querySelector(selector);
        if (dateElement) {
            extractedData.publishDate = dateElement.getAttribute('content') || 
                dateElement.getAttribute('datetime') || 
                dateElement.textContent.trim();
            break;
        }
    }

    // Extract author
    const authorSelectors = [
        'meta[name="author"]',
        'meta[property="article:author"]',
        '.author-name',
        '.article-author',
        '[rel="author"]'
    ];

    for (const selector of authorSelectors) {
        const authorElement = document.querySelector(selector);
        if (authorElement) {
            extractedData.author = authorElement.getAttribute('content') || 
                authorElement.textContent.trim();
            break;
        }
    }

    // Try to find main article content
    const articleContent = findMainArticleContent();
    
    if (articleContent) {
        // Extract headings
        const headings = articleContent.querySelectorAll('h1, h2, h3, h4');
        extractedData.headings = Array.from(headings)
            .map(h => h.textContent.trim())
            .filter(text => text.length > 0);

        // Extract paragraphs
        const paragraphs = articleContent.querySelectorAll('p');
        extractedData.paragraphs = Array.from(paragraphs)
            .map(p => p.textContent.trim())
            .filter(text => text.length > 30); // Filter out very short paragraphs

        // Extract main content text
        extractedData.mainContent = extractedData.paragraphs.join('\n\n');

        // Extract images with captions
        const images = articleContent.querySelectorAll('img');
        extractedData.images = Array.from(images)
            .slice(0, 5) // Limit to first 5 images
            .map(img => ({
                src: img.src,
                alt: img.alt || '',
                caption: findImageCaption(img)
            }));
    } else {
        // Fallback: extract from body
        extractedData.mainContent = extractBodyContent();
    }

    // Limit content length to avoid token limits
    if (extractedData.mainContent.length > 8000) {
        extractedData.mainContent = extractedData.mainContent.substring(0, 8000) + '...';
    }
    console.log(`Extracted data:\n\t: ${extractedData}`);
    return extractedData;
}

/**
 * Find the main article content using various strategies
 */
function findMainArticleContent() {
    // Strategy 1: Look for semantic HTML5 elements
    const articleElement = document.querySelector('article');
    if (articleElement && hasSubstantialContent(articleElement)) {
        return articleElement;
    }

    // Strategy 2: Look for common article class names
    const commonArticleSelectors = [
        'main article',
        '[role="main"] article',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.article-body',
        '.story-body',
        '.post-body',
        '#article-content',
        '#post-content',
        '.content-body',
        '[itemprop="articleBody"]'
    ];

    for (const selector of commonArticleSelectors) {
        const element = document.querySelector(selector);
        if (element && hasSubstantialContent(element)) {
            return element;
        }
    }

    // Strategy 3: Find the element with most paragraph text
    const main = document.querySelector('main') || document.body;
    const containers = main.querySelectorAll('div, section, article');
    
    let maxTextLength = 0;
    let bestContainer = null;

    containers.forEach(container => {
        const paragraphs = container.querySelectorAll('p');
        const textLength = Array.from(paragraphs)
            .reduce((sum, p) => sum + p.textContent.length, 0);
        
        if (textLength > maxTextLength && 
            textLength > 500 && // Minimum content threshold
            !isNavigationOrFooter(container)) {
            maxTextLength = textLength;
            bestContainer = container;
        }
    });

    return bestContainer;
}

/**
 * Check if element has substantial content
 */
function hasSubstantialContent(element) {
    const text = element.textContent.trim();
    const paragraphs = element.querySelectorAll('p');
    return text.length > 300 && paragraphs.length >= 3;
}

/**
 * Check if element is navigation or footer
 */
function isNavigationOrFooter(element) {
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    const role = element.getAttribute('role')?.toLowerCase() || '';
    
    const excludePatterns = [
        'nav', 'navigation', 'menu', 'header', 'footer', 
        'sidebar', 'widget', 'advertisement', 'ad-', 
        'comment', 'related', 'recommended'
    ];

    return excludePatterns.some(pattern => 
        className.includes(pattern) || 
        id.includes(pattern) || 
        role.includes(pattern)
    );
}

/**
 * Find caption for an image
 */
function findImageCaption(img) {
    // Check parent figure element
    const figure = img.closest('figure');
    if (figure) {
        const figcaption = figure.querySelector('figcaption');
        if (figcaption) {
            return figcaption.textContent.trim();
        }
    }

    // Check sibling elements
    const nextSibling = img.nextElementSibling;
    if (nextSibling && 
        (nextSibling.className.includes('caption') || 
         nextSibling.className.includes('credit'))) {
        return nextSibling.textContent.trim();
    }

    return '';
}

/**
 * Fallback method to extract content from body
 */
function extractBodyContent() {
    const body = document.body.cloneNode(true);
    
    // Remove unwanted elements
    const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer',
        'aside', '.advertisement', '.ad', '.sidebar',
        '.comments', '.social-share', '.related-posts'
    ];

    unwantedSelectors.forEach(selector => {
        const elements = body.querySelectorAll(selector);
        elements.forEach(el => el.remove());
    });

    // Get all paragraphs
    const paragraphs = body.querySelectorAll('p');
    const content = Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(text => text.length > 30)
        .join('\n\n');

    return content;
}

/**
 * Get a summary snippet of the page
 */
function getContentSummary(maxLength = 500) {
    const content = extractPageContent();
    const summary = content.metaDescription || 
                   content.mainContent.substring(0, maxLength) + '...';
    return summary;
}

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractPageContent,
        getContentSummary
    };
}

console.log('Smart News Assistant content script loaded');