# Quick Review Checklist

## Pre-Commit Checklist

### Security 🔒
- [ ] No hardcoded credentials, tokens, or API keys
- [ ] No sensitive data logged
- [ ] Auth middleware on protected routes
- [ ] Input validation on user data
- [ ] Parameterized SQL queries (no string concatenation)

### API URLs 🌐
- [ ] Uses `getApiBaseUrl()` for all API calls
- [ ] No hardcoded `localhost:8081`
- [ ] No hardcoded production URLs

### File Structure 📁
- [ ] Components ≤ 200 lines
- [ ] Services ≤ 300 lines
- [ ] Stores ≤ 250 lines
- [ ] Utilities ≤ 100 lines
- [ ] Correct naming conventions

### Imports 📦
- [ ] Correct import order (React → stores → services → components → types → styles)
- [ ] No circular dependencies
- [ ] No unused imports

### React Patterns ⚛️
- [ ] Refs used for event handler closures
- [ ] useEffect dependencies complete
- [ ] No memory leaks (cleanup in useEffect)
- [ ] Keys on list items

### TypeScript 📝
- [ ] No `any` types without justification
- [ ] Proper null checks
- [ ] Type exports from `types/` directory

### Error Handling ⚠️
- [ ] Try/catch on async operations
- [ ] Errors passed to error handler (backend)
- [ ] User-friendly error messages (frontend)

### Forbidden Patterns 🚫
- [ ] No `github-pages/` direct modifications
- [ ] No `console.log` in production code
- [ ] No storing converted URLs in cache
- [ ] No removing `config.js` handling

## Review Output Template

```markdown
## Review: [filename]

**Status**: ✅ Pass / ⚠️ Warnings / 🚨 Fail

### Issues
| Line | Severity | Issue | Suggested Fix |
|------|----------|-------|---------------|
| 15   | 🚨       | Hardcoded URL | Use `getApiBaseUrl()` |

### Summary
- Critical: X
- Warnings: Y
- Suggestions: Z
```

## Severity Levels

| Level | Icon | Description | Action |
|-------|------|-------------|--------|
| Critical | 🚨 | Security/forbidden patterns | Must fix before commit |
| Warning | ⚠️ | Best practice violation | Should fix |
| Suggestion | 💡 | Improvement opportunity | Consider fixing |
| Info | ℹ️ | FYI/documentation | No action needed |
