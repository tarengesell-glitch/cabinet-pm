// Public API of the shop-settings module. Other code may import only this file.
export {
  DESIGN_RULES,
  DESIGN_TOOL_ACTIONS,
  type DesignToolAction,
  RULE_KINDS,
  RULE_STATUSES,
  readDesignRules,
  type DesignRule,
  type DesignRules,
  type RuleKind,
  type RuleStatus,
} from './model/design-rules';
export {
  CHECKED_RULE_IDS,
  type CheckedRuleId,
  DESIGN_RULE_CHECKS,
  DESIGN_RULE_CHECK_SETTINGS,
  type DesignRuleCheckSettings,
  buildDesignRuleChecks,
  designRuleCheckId,
  readCheckSettings,
} from './model/design-rule-checks';
