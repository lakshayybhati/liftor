/**
 * Production Monitoring and Feedback System
 * Tracks system performance and user satisfaction
 */

interface PerformanceMetrics {
  planGenerationTime: number;
  aiSuccessRate: number;
  validationSuccessRate: number;
  userSatisfactionScore: number;
  errorRate: number;
  tokenUsage: number;
  timestamp: string;
  validationCorrectionCount?: number; // Track corrected plans
}

interface UserFeedback {
  planId: string;
  userId: string;
  rating: number; // 1-5 stars
  feedback: string;
  category: 'workout' | 'nutrition' | 'overall' | 'technical';
  timestamp: string;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  lastCheck: string;
  metrics: PerformanceMetrics;
  issues: string[];
}

class ProductionMonitor {
  private metrics: PerformanceMetrics[] = [];
  private feedback: UserFeedback[] = [];
  private maxMetricsHistory = 100;
  private alertThresholds = {
    minSuccessRate: 0.85,
    maxResponseTime: 180000, // 180 seconds to align with DeepSeek timeout
    maxErrorRate: 0.15,
    minSatisfactionScore: 3.5
  };

  /**
   * Track plan generation performance
   */
  trackPlanGeneration(
    startTime: number,
    success: boolean,
    aiUsed: boolean,
    validationPassed: boolean,
    tokenCount: number = 0,
    errors: string[] = [],
    correctionsApplied: number = 0
  ): void {
    const endTime = Date.now();
    const generationTime = endTime - startTime;

    const metric: PerformanceMetrics = {
      planGenerationTime: generationTime,
      aiSuccessRate: aiUsed && success ? 1 : 0,
      validationSuccessRate: validationPassed ? 1 : 0,
      userSatisfactionScore: 0, // Will be updated when user provides feedback
      errorRate: errors.length > 0 ? 1 : 0,
      tokenUsage: tokenCount,
      timestamp: new Date().toISOString(),
      validationCorrectionCount: correctionsApplied
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Log performance
    console.log(`📊 Performance: ${generationTime}ms, AI: ${aiUsed}, Success: ${success}, Tokens: ${tokenCount}, Corrections: ${correctionsApplied}`);

    // Check for alerts
    this.checkAlerts(metric, errors);
  }

  /**
   * Record user feedback
   */
  recordUserFeedback(feedback: Omit<UserFeedback, 'timestamp'>): void {
    const timestampedFeedback: UserFeedback = {
      ...feedback,
      timestamp: new Date().toISOString()
    };

    this.feedback.push(timestampedFeedback);
    console.log(`📝 User feedback: ${feedback.rating}/5 stars for plan ${feedback.planId}`);

    // Update satisfaction score in recent metrics
    const recentMetrics = this.metrics.slice(-10);
    recentMetrics.forEach(metric => {
      if (metric.userSatisfactionScore === 0) {
        metric.userSatisfactionScore = feedback.rating;
      }
    });
  }

  /**
   * Get current system health
   */
  getSystemHealth(): SystemHealth {
    if (this.metrics.length === 0) {
      return {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        metrics: {
          planGenerationTime: 0,
          aiSuccessRate: 1,
          validationSuccessRate: 1,
          userSatisfactionScore: 5,
          errorRate: 0,
          tokenUsage: 0,
          timestamp: new Date().toISOString(),
          validationCorrectionCount: 0
        },
        issues: []
      };
    }

    const recentMetrics = this.metrics.slice(-20); // Last 20 generations
    const avgMetrics = this.calculateAverageMetrics(recentMetrics);
    const issues: string[] = [];

    // Check thresholds
    if (avgMetrics.aiSuccessRate < this.alertThresholds.minSuccessRate) {
      issues.push(`AI success rate below threshold: ${(avgMetrics.aiSuccessRate * 100).toFixed(1)}%`);
    }

    if (avgMetrics.planGenerationTime > this.alertThresholds.maxResponseTime) {
      issues.push(`Response time too high: ${avgMetrics.planGenerationTime}ms`);
    }

    if (avgMetrics.errorRate > this.alertThresholds.maxErrorRate) {
      issues.push(`Error rate too high: ${(avgMetrics.errorRate * 100).toFixed(1)}%`);
    }

    if (avgMetrics.userSatisfactionScore > 0 && avgMetrics.userSatisfactionScore < this.alertThresholds.minSatisfactionScore) {
      issues.push(`User satisfaction below threshold: ${avgMetrics.userSatisfactionScore.toFixed(1)}/5`);
    }

    const status: SystemHealth['status'] = 
      issues.length === 0 ? 'healthy' :
      issues.length <= 2 ? 'degraded' : 'critical';

    return {
      status,
      lastCheck: new Date().toISOString(),
      metrics: avgMetrics,
      issues
    };
  }

  /**
   * Get performance analytics
   */
  getAnalytics() {
    const recentMetrics = this.metrics.slice(-50);
    const recentFeedback = this.feedback.slice(-50);

    return {
      totalGenerations: this.metrics.length,
      avgGenerationTime: this.calculateAverage(recentMetrics.map(m => m.planGenerationTime)),
      aiSuccessRate: this.calculateAverage(recentMetrics.map(m => m.aiSuccessRate)),
      validationSuccessRate: this.calculateAverage(recentMetrics.map(m => m.validationSuccessRate)),
      avgCorrectionCount: this.calculateAverage(recentMetrics.map(m => m.validationCorrectionCount || 0)),
      avgSatisfactionScore: this.calculateAverage(
        recentFeedback.map(f => f.rating).filter(r => r > 0)
      ),
      totalTokenUsage: recentMetrics.reduce((sum, m) => sum + m.tokenUsage, 0),
      feedbackCount: recentFeedback.length,
      feedbackByCategory: this.groupFeedbackByCategory(recentFeedback)
    };
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metric: PerformanceMetrics, errors: string[]): void {
    if (metric.planGenerationTime > this.alertThresholds.maxResponseTime) {
      console.warn(`⚠️ ALERT: Slow response time: ${metric.planGenerationTime}ms`);
    }

    if (metric.aiSuccessRate === 0) {
      console.warn(`⚠️ ALERT: AI generation failed`);
    }

    if (errors.length > 0) {
      console.warn(`⚠️ ALERT: Errors occurred:`, errors);
    }

    // Check recent trend
    const recentMetrics = this.metrics.slice(-5);
    if (recentMetrics.length >= 5) {
      const recentSuccessRate = this.calculateAverage(recentMetrics.map(m => m.aiSuccessRate));
      if (recentSuccessRate < this.alertThresholds.minSuccessRate) {
        console.error(`🚨 CRITICAL: AI success rate dropped to ${(recentSuccessRate * 100).toFixed(1)}%`);
      }
    }
  }

  /**
   * Calculate average metrics
   */
  private calculateAverageMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
    if (metrics.length === 0) {
      return {
        planGenerationTime: 0,
        aiSuccessRate: 1,
        validationSuccessRate: 1,
        userSatisfactionScore: 5,
        errorRate: 0,
        tokenUsage: 0,
        timestamp: new Date().toISOString(),
        validationCorrectionCount: 0
      };
    }

    return {
      planGenerationTime: this.calculateAverage(metrics.map(m => m.planGenerationTime)),
      aiSuccessRate: this.calculateAverage(metrics.map(m => m.aiSuccessRate)),
      validationSuccessRate: this.calculateAverage(metrics.map(m => m.validationSuccessRate)),
      userSatisfactionScore: this.calculateAverage(
        metrics.map(m => m.userSatisfactionScore).filter(s => s > 0)
      ),
      errorRate: this.calculateAverage(metrics.map(m => m.errorRate)),
      tokenUsage: this.calculateAverage(metrics.map(m => m.tokenUsage)),
      timestamp: new Date().toISOString(),
      validationCorrectionCount: this.calculateAverage(metrics.map(m => m.validationCorrectionCount || 0))
    };
  }

  /**
   * Calculate simple average
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Group feedback by category
   */
  private groupFeedbackByCategory(feedback: UserFeedback[]) {
    const grouped: { [key: string]: { count: number; avgRating: number } } = {};

    feedback.forEach(f => {
      if (!grouped[f.category]) {
        grouped[f.category] = { count: 0, avgRating: 0 };
      }
      grouped[f.category].count++;
    });

    // Calculate average ratings
    Object.keys(grouped).forEach(category => {
      const categoryFeedback = feedback.filter(f => f.category === category);
      grouped[category].avgRating = this.calculateAverage(
        categoryFeedback.map(f => f.rating)
      );
    });

    return grouped;
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      feedback: this.feedback,
      analytics: this.getAnalytics(),
      systemHealth: this.getSystemHealth(),
      exportTime: new Date().toISOString()
    }, null, 2);
  }
}

// Global monitor instance
export const productionMonitor = new ProductionMonitor();

/**
 * Decorator for monitoring function performance
 */
export function monitorPerformance<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  functionName: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let success = false;
    let aiUsed = false;
    let validationPassed = false;
    let tokenCount = 0;
    let correctionsApplied = 0;
    const errors: string[] = [];

    try {
      const result = await fn(...args);
      success = true;
      aiUsed = true; // Assume AI was used if function completed
      validationPassed = true; // Assume validation passed if no errors
      
      // Try to detect if corrections were applied (if result has correction metadata)
      if (result && typeof result === 'object' && 'correctionsApplied' in result) {
        correctionsApplied = result.correctionsApplied;
      }
      
      console.log(`✅ ${functionName} completed successfully`);
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      console.error(`❌ ${functionName} failed:`, error);
      throw error;
    } finally {
      productionMonitor.trackPlanGeneration(
        startTime,
        success,
        aiUsed,
        validationPassed,
        tokenCount,
        errors,
        correctionsApplied
      );
    }
  }) as T;
}

/**
 * Log system status periodically
 */
export function startSystemMonitoring(): void {
  const logInterval = 5 * 60 * 1000; // 5 minutes

  setInterval(() => {
    const health = productionMonitor.getSystemHealth();
    const analytics = productionMonitor.getAnalytics();

    console.log('\n📊 SYSTEM STATUS REPORT');
    console.log('========================');
    console.log(`Status: ${health.status.toUpperCase()}`);
    console.log(`Generations: ${analytics.totalGenerations}`);
    console.log(`Avg Response Time: ${analytics.avgGenerationTime.toFixed(0)}ms`);
    console.log(`AI Success Rate: ${(analytics.aiSuccessRate * 100).toFixed(1)}%`);
    console.log(`Avg Corrections: ${analytics.avgCorrectionCount.toFixed(1)} per plan`);
    console.log(`User Satisfaction: ${analytics.avgSatisfactionScore.toFixed(1)}/5`);
    
    if (health.issues.length > 0) {
      console.log('\n⚠️ Issues:');
      health.issues.forEach(issue => console.log(`  - ${issue}`));
    }
    
    console.log('========================\n');
  }, logInterval);
}

// Types for external use
export type { PerformanceMetrics, UserFeedback, SystemHealth };
