# Base Plan Generation - Complete Rebuild Guide

## Overview
The base plan generation system has accumulated multiple conflicting approaches over time. This guide outlines all considerations for a clean, maintainable rebuild that avoids the current system's pitfalls.

## Core System Requirements

### 1. Single Source of Truth
- One function determines workout splits for all users
- One calculation method for nutrition targets
- One validation system for all plans
- Consistent data flow from generation to display

### 2. Deterministic Behavior
- Same user profile → same plan output every time
- No random elements affecting core logic
- Predictable fallback behavior
- Clear decision trees without ambiguity

### 3. Equipment-Aware Generation
- Plans must respect available equipment constraints
- No exercises requiring unavailable tools
- Graceful degradation for limited equipment
- Equipment-specific exercise variations

## Workout Split Logic Considerations

### Training Level Mapping
- **Beginner**: Full body focus, compound movements, progressive overload basics
- **Intermediate**: Split routines, specialized movements, volume progression
- **Professional**: Advanced splits, accessory work, periodization concepts

### Training Frequency Integration
- Split complexity scales with training days available
- Recovery placement based on actual training load
- No fixed rest days (Wednesday/Sunday assumptions)
- Even distribution of training vs recovery

### Equipment Influence
- Bodyweight-only users: Calisthenics-focused plans
- Dumbbells available: Compound movements with resistance options
- Full gym access: Complete exercise library utilization
- Progressive equipment requirements within splits

## Nutrition System Requirements

### Target Calculations
- TDEE based on accurate user metrics (age, weight, height, activity)
- Protein targets considering body composition goals
- Macronutrient distribution aligned with fitness objectives
- Hydration scaling with workout intensity

### Meal Structure Consistency
- Same meal pattern across all days for user familiarity
- Dietary preference enforcement throughout the week
- Realistic portion sizes and preparation methods
- Cultural/contextual food selection appropriateness

### Quantity Specification
- Every food item must have exact measurable quantities
- No generic placeholders ("complex carbs", "lean protein")
- Portion sizes appropriate to user's goals and constraints
- Consistent measurement units throughout

## AI Prompt Design Principles

### Information Hierarchy
- Critical constraints first (equipment, goals, days)
- User profile data organized by relevance
- Clear success criteria and validation requirements
- Minimal noise, maximum clarity

### Output Structure Requirements
- Strict JSON format enforcement
- Complete 7-day coverage guarantee
- Consistent data structure across all days
- Error-resistant parsing requirements

### Content Quality Standards
- Exercise selection from allowed equipment only
- Realistic workout durations and volumes
- Evidence-based recovery recommendations
- Personalized but not overwhelming guidance

## Validation System Essentials

### Structural Integrity
- All 7 days present and properly formatted
- Required fields exist in every component
- Array types contain actual arrays
- Numeric values within acceptable ranges

### Content Validation
- Equipment compatibility verification
- Dietary restriction compliance
- Time constraint adherence
- Exercise safety considerations

### Data Consistency
- Nutrition targets match across all days
- Workout intensity appropriate for training level
- Recovery recommendations match daily demands
- Supplement suggestions evidence-based

## Error Handling Patterns

### Graceful Degradation
- Primary system failure → secondary system activation
- Partial plan completion → filling missing components
- Equipment unavailability → alternative exercise selection
- API failure → rule-based generation fallback

### User Communication
- Clear error messages without technical jargon
- Recovery time estimates for failed generations
- Alternative options when primary path unavailable
- Progress indication during generation

### System Reliability
- Multiple fallback layers for critical failures
- Partial success handling (some days complete, others not)
- State preservation during error recovery
- Non-blocking error logging and monitoring

## Display System Considerations

### Data Presentation
- Complete information availability across all views
- Consistent formatting between preview and detail screens
- Proper handling of optional vs required fields
- User-friendly data transformation

### State Management
- Plan data persistence across app sessions
- Real-time updates without full regeneration
- Edit capability with validation
- Undo/redo functionality for user modifications

### Performance Optimization
- Lazy loading of plan generation components
- Cached calculations for repeated operations
- Efficient data structures for large plans
- Memory management for unused plan data

## Testing Strategy Requirements

### Input Coverage
- All user profile combinations (goals, equipment, levels)
- Edge cases (1 training day, 7 training days)
- Equipment limitations (bodyweight only, full gym)
- Dietary restrictions and preferences

### Output Validation
- Structural correctness of generated plans
- Content appropriateness for user profiles
- Equipment compliance verification
- Performance metric achievement

### Error Scenario Testing
- Network failure during AI calls
- Invalid user data handling
- Equipment constraint violations
- Time limit exceedances

## Maintenance Considerations

### Code Organization
- Clear separation of concerns
- Single responsibility principle adherence
- Consistent naming conventions
- Comprehensive documentation

### Monitoring and Analytics
- Generation success rate tracking
- User satisfaction metrics
- Error pattern identification
- Performance bottleneck detection

### Future Extensibility
- New equipment type addition pathways
- Training methodology integration points
- Dietary preference expansion capabilities
- Internationalization preparation

## Common Pitfalls to Avoid

### Logic Conflicts
- Multiple competing decision systems
- Inconsistent rule application
- Equipment validation at multiple layers
- Conflicting nutrition calculation methods

### Data Inconsistencies
- Different displays showing different data
- Optional fields treated as required
- Missing validation for critical paths
- State synchronization issues

### Performance Issues
- Unnecessary recalculations
- Large data structures for simple operations
- Synchronous operations blocking UI
- Memory leaks from unused references

### User Experience Problems
- Incomplete plan presentations
- Confusing error messages
- Long wait times without feedback
- Inconsistent behavior across sessions

## Implementation Priority Order

1. **Core Logic Definition**: Establish single source of truth functions
2. **Input Validation**: Ensure clean data entry points
3. **Generation Pipeline**: Build reliable plan creation flow
4. **Error Handling**: Comprehensive failure recovery systems
5. **Display Systems**: Consistent data presentation layers
6. **Testing Framework**: Complete coverage validation
7. **Performance Optimization**: Efficiency improvements
8. **Monitoring Integration**: Analytics and error tracking

## Success Criteria

- **Consistency**: Same inputs produce identical outputs
- **Reliability**: 99%+ successful plan generation rate
- **Completeness**: All required data present in every plan
- **Compliance**: Strict adherence to user constraints
- **Performance**: Sub-30 second generation times
- **Maintainability**: Clear, documented, testable code
- **User Satisfaction**: Intuitive, helpful, personalized plans
