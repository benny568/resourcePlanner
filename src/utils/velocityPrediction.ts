import { Sprint, WorkItem } from '../types';

export interface VelocityAnalysis {
  averageVelocity: number;
  velocityTrend: 'improving' | 'declining' | 'stable';
  confidenceLevel: 'high' | 'medium' | 'low';
  sprintsWithData: number;
  lastActualVelocity?: number;
  predictedVelocity: number;
  velocityVariance: number;
}

export interface TeamCapacityAnalysis {
  frontendCapacity: number;
  backendCapacity: number;
  totalCapacity: number;
  utilizationRecommendation: number; // Recommended capacity utilization (e.g., 0.7 for 70%)
}

// Analyze historical velocity data to predict future sprint capacity
export function analyzeVelocityTrends(sprints: Sprint[]): VelocityAnalysis {
  const sprintsWithVelocity = sprints
    .filter(s => s.actualVelocity !== undefined && s.actualVelocity > 0)
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  if (sprintsWithVelocity.length === 0) {
    return {
      averageVelocity: 0,
      velocityTrend: 'stable',
      confidenceLevel: 'low',
      sprintsWithData: 0,
      predictedVelocity: 0,
      velocityVariance: 0
    };
  }

  // Calculate basic statistics
  const velocities = sprintsWithVelocity.map(s => s.actualVelocity!);
  const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
  
  // Calculate variance
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length;
  const standardDeviation = Math.sqrt(variance);

  // Determine trend from recent vs older sprints
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  let predictedVelocity = avgVelocity;

  if (sprintsWithVelocity.length >= 6) {
    // High confidence with 6+ sprints
    const recent3 = sprintsWithVelocity.slice(-3);
    const previous3 = sprintsWithVelocity.slice(-6, -3);
    
    const recentAvg = recent3.reduce((sum, s) => sum + s.actualVelocity!, 0) / 3;
    const previousAvg = previous3.reduce((sum, s) => sum + s.actualVelocity!, 0) / 3;
    
    const change = (recentAvg - previousAvg) / previousAvg;
    
    if (change > 0.15) {
      trend = 'improving';
      // Predict slightly higher velocity for improving trend
      predictedVelocity = recentAvg * 1.05;
    } else if (change < -0.15) {
      trend = 'declining';
      // Predict slightly lower velocity for declining trend
      predictedVelocity = recentAvg * 0.95;
    } else {
      trend = 'stable';
      predictedVelocity = recentAvg;
    }
    
    confidenceLevel = 'high';
  } else if (sprintsWithVelocity.length >= 3) {
    // Medium confidence with 3-5 sprints
    const recent = sprintsWithVelocity.slice(-2);
    const recentAvg = recent.reduce((sum, s) => sum + s.actualVelocity!, 0) / recent.length;
    predictedVelocity = (avgVelocity + recentAvg) / 2; // Weighted average
    confidenceLevel = 'medium';
  } else {
    // Low confidence with 1-2 sprints
    predictedVelocity = avgVelocity;
    confidenceLevel = 'low';
  }

  // Apply conservative factor for planning (reduce by 10% for uncertainty)
  const conservativeFactor = confidenceLevel === 'high' ? 0.95 : 
                           confidenceLevel === 'medium' ? 0.90 : 0.85;
  
  predictedVelocity *= conservativeFactor;

  return {
    averageVelocity: Math.round(avgVelocity * 10) / 10,
    velocityTrend: trend,
    confidenceLevel,
    sprintsWithData: sprintsWithVelocity.length,
    lastActualVelocity: sprintsWithVelocity[sprintsWithVelocity.length - 1]?.actualVelocity,
    predictedVelocity: Math.round(predictedVelocity * 10) / 10,
    velocityVariance: Math.round(variance * 10) / 10
  };
}

// Analyze team capacity and work distribution
export function analyzeTeamCapacity(
  teamMembers: any[], 
  workItems: WorkItem[], 
  velocityAnalysis: VelocityAnalysis
): TeamCapacityAnalysis {
  // Calculate team frontend/backend capacity
  const frontendMembers = teamMembers.filter(tm => 
    tm.skills.includes('frontend') && tm.capacity > 0
  ).length;
  
  const backendMembers = teamMembers.filter(tm => 
    tm.skills.includes('backend') && tm.capacity > 0
  ).length;

  // Calculate work distribution from unassigned items
  const unassignedItems = workItems.filter(wi => 
    wi.assignedSprints.length === 0 && wi.status !== 'Completed'
  );

  const frontendWork = unassignedItems.filter(wi => 
    wi.requiredSkills.includes('frontend')
  ).reduce((sum, wi) => sum + (wi.estimateStoryPoints || 0), 0);

  const backendWork = unassignedItems.filter(wi => 
    wi.requiredSkills.includes('backend')
  ).reduce((sum, wi) => sum + (wi.estimateStoryPoints || 0), 0);

  // Recommend utilization based on velocity confidence
  const baseUtilization = 0.70; // Start with 70% base utilization
  const utilizationAdjustment = 
    velocityAnalysis.confidenceLevel === 'high' ? 0.05 : 
    velocityAnalysis.confidenceLevel === 'medium' ? 0.0 : -0.05;

  const recommendedUtilization = Math.min(0.85, Math.max(0.60, 
    baseUtilization + utilizationAdjustment
  ));

  return {
    frontendCapacity: frontendMembers,
    backendCapacity: backendMembers,
    totalCapacity: teamMembers.filter(tm => tm.capacity > 0).length,
    utilizationRecommendation: recommendedUtilization
  };
}

// Calculate optimal sprint velocity based on historical data and team capacity
export function calculateOptimalSprintVelocity(
  velocityAnalysis: VelocityAnalysis,
  teamCapacity: TeamCapacityAnalysis,
  plannedVelocity: number
): {
  recommendedVelocity: number;
  adjustmentReason: string;
  confidence: 'high' | 'medium' | 'low';
} {
  if (velocityAnalysis.sprintsWithData === 0) {
    // No historical data - use planned velocity
    return {
      recommendedVelocity: plannedVelocity,
      adjustmentReason: 'No historical data available, using planned velocity',
      confidence: 'low'
    };
  }

  const historicalVelocity = velocityAnalysis.predictedVelocity;
  const velocityDifference = Math.abs(plannedVelocity - historicalVelocity);
  const percentageDifference = velocityDifference / historicalVelocity;

  // If planned velocity is within 20% of predicted, use predicted
  if (percentageDifference <= 0.20) {
    return {
      recommendedVelocity: historicalVelocity,
      adjustmentReason: `Adjusted to historical average (${velocityAnalysis.sprintsWithData} sprints)`,
      confidence: velocityAnalysis.confidenceLevel
    };
  }

  // If planned velocity is significantly different, blend the values
  const blendFactor = velocityAnalysis.confidenceLevel === 'high' ? 0.7 : 
                     velocityAnalysis.confidenceLevel === 'medium' ? 0.5 : 0.3;
  
  const blendedVelocity = (historicalVelocity * blendFactor) + (plannedVelocity * (1 - blendFactor));

  return {
    recommendedVelocity: Math.round(blendedVelocity * 10) / 10,
    adjustmentReason: `Blended planned (${plannedVelocity}) with historical (${historicalVelocity})`,
    confidence: velocityAnalysis.confidenceLevel
  };
}

// Enhanced sprint planning algorithm that considers historical data
export function generateVelocityAwareSprintPlan(
  sprints: Sprint[],
  workItems: WorkItem[],
  teamMembers: any[]
): {
  updatedSprints: Sprint[];
  velocityInsights: {
    analysis: VelocityAnalysis;
    teamCapacity: TeamCapacityAnalysis;
    recommendations: string[];
  };
} {
  const velocityAnalysis = analyzeVelocityTrends(sprints);
  const teamCapacity = analyzeTeamCapacity(teamMembers, workItems, velocityAnalysis);

  // Update sprint velocities based on historical data
  const updatedSprints = sprints.map(sprint => {
    if (sprint.actualVelocity !== undefined) {
      // Don't modify completed sprints
      return sprint;
    }

    // Don't override planned velocities during auto-assign - preserve user's manual settings
    // The velocity prediction should only suggest, not override existing values
    return sprint;
  });

  // Generate recommendations
  const recommendations: string[] = [];

  if (velocityAnalysis.sprintsWithData === 0) {
    recommendations.push('No historical velocity data available. Consider syncing completed sprints from Jira.');
  } else {
    if (velocityAnalysis.confidenceLevel === 'low') {
      recommendations.push(`Only ${velocityAnalysis.sprintsWithData} sprint(s) with velocity data. Sync more completed sprints for better predictions.`);
    }

    if (velocityAnalysis.velocityTrend === 'improving') {
      recommendations.push('Team velocity is trending upward. Consider slightly increasing sprint capacity.');
    } else if (velocityAnalysis.velocityTrend === 'declining') {
      recommendations.push('Team velocity is declining. Review sprint planning and potential blockers.');
    }

    if (velocityAnalysis.velocityVariance > velocityAnalysis.averageVelocity * 0.3) {
      recommendations.push('High velocity variance detected. Focus on consistent story sizing and sprint planning.');
    }
  }

  if (teamCapacity.frontendCapacity === 0 || teamCapacity.backendCapacity === 0) {
    recommendations.push('Team lacks balanced frontend/backend capacity. Consider cross-training or hiring.');
  }

  return {
    updatedSprints,
    velocityInsights: {
      analysis: velocityAnalysis,
      teamCapacity,
      recommendations
    }
  };
}


