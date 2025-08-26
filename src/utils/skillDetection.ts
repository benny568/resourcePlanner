/**
 * Enhanced skill detection utility for determining Frontend vs Backend work based on content analysis
 */

export interface SkillAnalysis {
  frontendScore: number;
  backendScore: number;
  detectedSkill: 'frontend' | 'backend' | 'both' | 'unclear';
  confidence: 'high' | 'medium' | 'low';
  detectedPatterns: {
    frontend: string[];
    backend: string[];
  };
}

// Frontend/UI indicators - words that strongly suggest frontend work
const FRONTEND_INDICATORS = {
  // UI Components & Elements
  ui: ['panel', 'slide out', 'slideout', 'modal', 'popup', 'dialog', 'dropdown', 'menu', 'navbar', 'sidebar', 'header', 'footer', 'button', 'form', 'input', 'checkbox', 'radio', 'slider', 'toggle', 'tab', 'accordion', 'carousel', 'tooltip', 'badge', 'card', 'grid', 'table', 'list', 'icon', 'image', 'avatar', 'progress bar', 'spinner', 'loader'],
  
  // User Interactions
  interactions: ['click', 'hover', 'scroll', 'drag', 'drop', 'swipe', 'tap', 'touch', 'resize', 'focus', 'blur', 'select', 'navigate', 'route', 'redirect', 'refresh', 'reload'],
  
  // Visual & Layout
  visual: ['display', 'show', 'hide', 'visible', 'layout', 'responsive', 'mobile', 'desktop', 'style', 'css', 'theme', 'color', 'font', 'animation', 'transition', 'responsive design', 'viewport'],
  
  // Frontend Technologies
  tech: ['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'scss', 'sass', 'jsx', 'tsx', 'dom', 'browser', 'client-side', 'frontend'],
  
  // User Experience
  ux: ['user interface', 'user experience', 'ui/ux', 'usability', 'accessibility', 'user flow', 'user journey', 'wireframe', 'mockup', 'prototype']
};

// Backend/API indicators - words that strongly suggest backend work
const BACKEND_INDICATORS = {
  // Data & Storage
  data: ['database', 'sql', 'query', 'store', 'save', 'persist', 'crud', 'migration', 'schema', 'model', 'entity', 'repository', 'orm', 'nosql', 'mongodb', 'postgresql', 'mysql'],
  
  // APIs & Services
  api: ['api', 'endpoint', 'rest', 'graphql', 'microservice', 'service', 'controller', 'middleware', 'handler', 'route handler', 'web service', 'integration'],
  
  // Server & Infrastructure
  server: ['server', 'backend', 'server-side', 'deploy', 'deployment', 'infrastructure', 'docker', 'kubernetes', 'cloud', 'aws', 'azure', 'hosting'],
  
  // Authentication & Security
  auth: ['authentication', 'authorization', 'login', 'logout', 'session', 'token', 'jwt', 'oauth', 'security', 'permission', 'role', 'access control'],
  
  // Backend Technologies
  tech: ['node.js', 'express', 'django', 'flask', 'spring', '.net', 'java', 'python', 'c#', 'php', 'ruby', 'go', 'rust'],
  
  // Business Logic
  logic: ['business logic', 'validation', 'processing', 'calculation', 'algorithm', 'workflow', 'batch', 'cron', 'scheduler', 'background job']
};

/**
 * Analyzes text content to determine if it indicates Frontend or Backend work
 */
export function analyzeDescriptionForSkills(title: string, description: string): SkillAnalysis {
  const text = `${title} ${description}`.toLowerCase();
  
  let frontendScore = 0;
  let backendScore = 0;
  const detectedPatterns = {
    frontend: [] as string[],
    backend: [] as string[]
  };

  // Check for Frontend indicators
  Object.entries(FRONTEND_INDICATORS).forEach(([category, indicators]) => {
    indicators.forEach(indicator => {
      if (text.includes(indicator)) {
        // Weight different categories differently
        const weight = category === 'ui' || category === 'interactions' ? 3 : 
                      category === 'tech' ? 2 : 1;
        frontendScore += weight;
        detectedPatterns.frontend.push(indicator);
      }
    });
  });

  // Check for Backend indicators  
  Object.entries(BACKEND_INDICATORS).forEach(([category, indicators]) => {
    indicators.forEach(indicator => {
      if (text.includes(indicator)) {
        // Weight different categories differently
        const weight = category === 'api' || category === 'data' ? 3 : 
                      category === 'tech' ? 2 : 1;
        backendScore += weight;
        detectedPatterns.backend.push(indicator);
      }
    });
  });

  // Determine the skill based on scores
  let detectedSkill: 'frontend' | 'backend' | 'both' | 'unclear';
  let confidence: 'high' | 'medium' | 'low';

  const totalScore = frontendScore + backendScore;
  const scoreDifference = Math.abs(frontendScore - backendScore);

  if (totalScore === 0) {
    detectedSkill = 'unclear';
    confidence = 'low';
  } else if (scoreDifference >= 4) {
    // Strong indication for one skill
    detectedSkill = frontendScore > backendScore ? 'frontend' : 'backend';
    confidence = 'high';
  } else if (scoreDifference >= 2) {
    // Moderate indication
    detectedSkill = frontendScore > backendScore ? 'frontend' : 'backend';
    confidence = 'medium';
  } else if (frontendScore > 0 && backendScore > 0) {
    // Both skills detected
    detectedSkill = 'both';
    confidence = 'medium';
  } else {
    // Weak indication
    detectedSkill = frontendScore > backendScore ? 'frontend' : 'backend';
    confidence = 'low';
  }

  return {
    frontendScore,
    backendScore,
    detectedSkill,
    confidence,
    detectedPatterns
  };
}

/**
 * Enhanced skill detection function that replaces the simple be/fe text matching
 */
export function detectSkillsFromContent(workItem: { title?: string; description?: string; requiredSkills?: string[] }): string[] {
  const title = workItem.title?.toLowerCase() || '';
  const description = workItem.description?.toLowerCase() || '';
  
  // 1. Check for explicit skill indicators in title (highest priority)
  const titleHasBackend = title.includes('be:') || title.includes('backend');
  const titleHasFrontend = title.includes('fe:') || title.includes('frontend');
  
  if (titleHasFrontend && !titleHasBackend) {
    console.log(`🎯 Auto-detected Frontend from explicit title indicator: "${workItem.title}"`);
    return ['frontend'];
  } else if (titleHasBackend && !titleHasFrontend) {
    console.log(`🎯 Auto-detected Backend from explicit title indicator: "${workItem.title}"`);
    return ['backend'];
  }
  
  // 2. Check for simple be/fe indicators in title (high priority)
  const titleHasBe = title.includes('be');
  const titleHasFe = title.includes('fe');
  
  if (titleHasFe && !titleHasBe) {
    console.log(`🎯 Auto-detected Frontend from title 'fe' indicator: "${workItem.title}"`);
    return ['frontend'];
  } else if (titleHasBe && !titleHasFe) {
    console.log(`🎯 Auto-detected Backend from title 'be' indicator: "${workItem.title}"`);
    return ['backend'];
  }
  
  // 3. Enhanced description analysis (medium priority)
  const analysis = analyzeDescriptionForSkills(title, description);
  
  if (analysis.confidence === 'high' && analysis.detectedSkill !== 'unclear' && analysis.detectedSkill !== 'both') {
    console.log(`🎯 Auto-detected ${analysis.detectedSkill} from enhanced description analysis (confidence: ${analysis.confidence})`);
    console.log(`   Patterns detected: ${analysis.detectedPatterns[analysis.detectedSkill].join(', ')}`);
    console.log(`   Title: "${workItem.title}"`);
    console.log(`   Description: "${workItem.description}"`);
    return [analysis.detectedSkill];
  } else if (analysis.confidence === 'medium' && analysis.detectedSkill !== 'unclear' && analysis.detectedSkill !== 'both') {
    console.log(`🎯 Auto-detected ${analysis.detectedSkill} from enhanced description analysis (confidence: ${analysis.confidence})`);
    console.log(`   Patterns detected: ${analysis.detectedPatterns[analysis.detectedSkill].join(', ')}`);
    return [analysis.detectedSkill];
  }
  
  // 4. Fallback to simple be/fe text in description (low priority)
  const descriptionHasBe = description.includes('be');
  const descriptionHasFe = description.includes('fe');
  
  if (descriptionHasFe && !descriptionHasBe) {
    console.log(`🎯 Auto-detected Frontend from description 'fe' text: "${workItem.title}"`);
    return ['frontend'];
  } else if (descriptionHasBe && !descriptionHasFe) {
    console.log(`🎯 Auto-detected Backend from description 'be' text: "${workItem.title}"`);
    return ['backend'];
  }
  
  // 5. Keep existing skills if no clear indicators
  console.log(`⚠️ No clear skill indicators found for: "${workItem.title}" - keeping existing skills`);
  return workItem.requiredSkills || ['frontend', 'backend'];
}

