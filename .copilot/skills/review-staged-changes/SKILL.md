---
name: review-staged-changes
description: Review staged git changes against project best practices for audiobookshelf. Use when users ask to review staged changes, check code before commit, validate staged files, or perform pre-commit review. Triggers on "review staged", "check my changes", "validate before commit", "review diff", or similar code review requests.
---

# Review Staged Changes

Review staged git changes against audiobookshelf project conventions and best practices.

## Workflow

1. Get staged changes using `get_changed_files` with `sourceControlState: ["staged"]`
2. For each changed file, analyze against the checklist below
3. Report issues by category with specific file locations and line numbers
4. Suggest fixes for each issue found

## Review Checklist

### TypeScript/React (Frontend)

#### API URL Patterns
- **REQUIRED**: Use `getApiBaseUrl()` from `frontend/src/config/appConfig.ts`
- **FORBIDDEN**: Hardcoded `localhost:8081` or any hardcoded API URLs

```typescript
// ✅ CORRECT
import { getApiBaseUrl } from '../config/appConfig';
const url = `${getApiBaseUrl()}/books/${bookId}`;

// ❌ WRONG
const url = `http://localhost:8081/api/books/${bookId}`;
```

#### State Management
- Use Zustand stores: `usePlayerStore`, `useAuthStore`
- Avoid prop drilling when store access is cleaner

#### Import Order
Enforce this order with blank lines between groups:
1. React/external libraries
2. Internal stores
3. Internal services  
4. Internal components
5. Types
6. Styles

#### File Size Limits
- Components: Max 200 lines
- Services: Max 300 lines
- Stores: Max 250 lines
- Utilities: Max 100 lines

Flag files exceeding limits and suggest splitting.

#### Naming Conventions
- Components: `PascalCase.tsx`
- Services: `camelCase.ts`
- Stores: `camelCaseStore.ts`
- Types: `PascalCase` in `types/` directory

### TypeScript (Backend)

#### Route Patterns
Verify routes follow existing patterns in `backend/src/routes/`:
- Use async handlers with proper error handling
- Apply appropriate middleware (auth, rbac, contentFilter)

#### Error Handling
- Use centralized error handler from `middleware/errorHandler.ts`
- Avoid swallowing errors without logging

### Audio URL Handling

For audio URLs, verify correct pattern:
```typescript
// Local storage URLs → use stream endpoint
if (url.includes('/storage/')) {
  const streamUrl = `${getApiBaseUrl()}/books/${bookId}/episodes/${index}/stream`;
  return `${streamUrl}?token=${accessToken}`;
}
// Azure SAS URLs → use directly
return url;
```

### React Best Practices

#### Refs for Event Handlers
Use refs to avoid stale closures in callbacks:
```typescript
const bookRef = useRef(book);
useEffect(() => { bookRef.current = book; }, [book]);

// In handler, use ref
const handleEvent = () => {
  const currentBook = bookRef.current; // Fresh value
};
```

#### useEffect Dependencies
- Verify all dependencies are listed
- Watch for missing dependencies causing stale closures
- Use refs pattern for values that change frequently

### Forbidden Patterns

Flag these immediately:
1. Hardcoded `localhost:8081` URLs
2. Direct modifications to `github-pages/` directory (should use build scripts)
3. Storing converted URLs in cache (convert at retrieval time)
4. Files over 300 lines without justification
5. Removing `config.js` handling in build scripts
6. Console.log statements in production code (use proper logging)
7. Any credentials or secrets

### Security Review

- No hardcoded tokens or API keys
- Auth middleware applied to protected routes
- Input validation on user data
- SQL injection prevention (parameterized queries)

## Output Format

```markdown
## Staged Changes Review

### Summary
- Files reviewed: X
- Issues found: Y (Z critical)

### Critical Issues 🚨
[List any security issues or forbidden patterns]

### Warnings ⚠️
[List best practice violations]

### Suggestions 💡
[List improvements and optimizations]

### Files Reviewed
- `path/to/file.ts` - ✅ No issues / ⚠️ X issues
```

## Quick Commands

- Review all staged: Analyze all staged files against checklist
- Review specific file: Focus on one file from staged changes
- Check imports only: Verify import order and patterns
- Check file sizes: Report any files exceeding limits
