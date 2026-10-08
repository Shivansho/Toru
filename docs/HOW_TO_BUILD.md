# How Toru Was Built: A Step-by-Step Developer Guide

# The Master Architect Guide: Building Toru From Scratch

This guide is an extensive, granular breakdown designed to teach you *exactly* how Toru was built, the specific lines of code that make the magic happen, and how you could architect this massive system without AI assistance.

## The HTML Diagram Visualizations
Before reading the code, it helps to see the architecture visually. We've generated two interactive HTML files containing Mermaid diagrams:
1. **[Workflow Implementations](file:///e:/gssoc/cityfever/Toru/docs/diagrams/workflow-implementation.html)**: Shows the High-Level Architecture, Authentication Flow, and Matchmaking Websocket loops.
2. **[AI Development Workflow](file:///e:/gssoc/cityfever/Toru/docs/diagrams/ai-workflow.html)**: Shows exactly how an AI processes logic, searches code, and iteratively executes tasks to build a project this large.

*(Open those HTML files in your browser to view the diagrams).*

---

## Part 1: The Tech Stack (What We Used & Why)

When building a full-stack real-time application, you must choose tools that excel at their specific job. Here is the entire stack explained:

### 1. Monorepo Management: `pnpm workspaces`
Instead of having two completely separate repositories (one for the frontend, one for the backend) where you constantly have to copy-paste TypeScript definitions, a monorepo puts them in one folder. `pnpm` is used instead of `npm` because it creates strict node_modules, saving disk space and running much faster.

### 2. Frontend: `Next.js 15+` & `Tailwind CSS`
- **Next.js (App Router):** The React framework used for `apps/web`. It provides server-side rendering (SSR), file-system routing, and built-in optimization. We chose this over raw React (Vite) because we needed to build static legal pages and handle middleware redirects seamlessly.
- **Tailwind CSS:** A utility-first CSS framework. Instead of writing separate CSS files, we write classes like `bg-slate-900 text-white` directly in our React components, enabling lightning-fast UI development.

### 3. Backend: `Node.js`, `Express.js`, & `Socket.IO`
- **Express.js:** Running inside `apps/api`, Express handles standard HTTP requests (like sending OTP emails and checking login status). 
- **Socket.IO:** The core engine for real-time chat. While Express handles HTTP (request -> response -> connection closes), Socket.IO maintains an open WebSocket pipeline. When Student A types a message, it is instantly pushed through the socket to Student B without them having to refresh the page.

### 4. Database & ORM: `PostgreSQL` & `Prisma`
- **PostgreSQL:** The relational database. Because Toru is a multi-tenant app (multiple colleges isolated from each other), relational databases are essential for strict schema enforcement.
- **Prisma:** An Object-Relational Mapper (ORM). Instead of writing raw SQL (`SELECT * FROM users`), we write TypeScript (`prisma.user.findUnique(...)`). It provides auto-completion and prevents SQL injection vulnerabilities out of the box.

### 5. Caching & Queues: `Redis`
Redis is an in-memory datastore. It is blazing fast because it stores data in RAM, not on a hard drive. We use it for:
- **Rate Limiting:** Stopping users from spamming the "Send OTP" button.
- **Matchmaking Queue:** Storing users who are actively searching for a chat.
- **Presence:** Tracking how many users are currently online.

---

## Part 2: Code Deep Dive (Explaining the Magic Lines)

If you were to code this manually, here are the most critical implementations you would need to understand.

### A. The Prisma Schema (`packages/shared/prisma/schema.prisma` or similar)
The database structure is the absolute foundation.
```prisma
model User {
  id             String        @id @default(uuid())
  collegeId      String
  emailHash      String        @unique
  ageVerified    Boolean       @default(false)
  status         UserStatus    @default(ACTIVE)
  // ...
}
```
**Explanation:** 
- `emailHash String @unique`: Notice we do **NOT** store the raw email string. If we stored raw emails, a database breach would expose every student's identity. By hashing it, we can still look them up, but hackers can't read the emails.
- `collegeId`: The core of multi-tenancy. Every query we ever make will include `where: { collegeId: ... }` to ensure data never leaks across colleges.

### B. Secure Authentication Route (`apps/api/src/routes/auth.ts`)
How do we send an OTP safely without leaking data?
```typescript
const emailHash = hashEmail(email, EMAIL_HASH_PEPPER); // Line A

const parsed = parseCollegeEmail(email, college, new Date());
if (parsed.type !== 'student') return res.json(genericSuccess); // Line B

await prisma.otpCode.upsert({ // Line C
  where: { emailHash },
  update: { codeHash: hashedCode, expiresAt: ... },
  create: { emailHash, codeHash: hashedCode, ... }
});

await sendOtpEmail(email, otp); // Line D
```
**Explanation:**
- **Line A:** Immediately, the email is mathematically hashed alongside a secret "pepper" (an environment variable). This creates an irreversible string.
- **Line B:** If a staff member or unauthorized person tries to join, we return a `genericSuccess` message. We intentionally *lie* to bad actors so they cannot use our API to probe and figure out which emails exist in our system.
- **Line C:** We store a **hash** of the 6-digit OTP code in the database, not the code itself.
- **Line D:** We send the plaintext code to their actual email, but once it leaves our server, we have no plaintext record of it.

### C. The Frontend Guard (`apps/web/src/components/AuthGuard.tsx`)
How do we force a user to complete onboarding if they try to skip it by changing the URL?
```tsx
useEffect(() => {
  fetch('/api/auth/me')
    .then(res => res.json())
    .then(user => {
      if (!user.ageVerified && pathname !== '/onboarding/age') {
        router.push('/onboarding/age');
      } else if (user.ageVerified && !user.hasConsented && pathname !== '/onboarding/consent') {
        router.push('/onboarding/consent');
      } else if (user.ageVerified && user.hasConsented && pathname.startsWith('/onboarding')) {
        router.push('/app'); // All done
      } else {
        setLoading(false); // Render children
      }
    })
}, [pathname]);
```
**Explanation:**
Every single time the `pathname` (URL) changes, this `useEffect` triggers. It asks the backend `/api/auth/me` what the user's status is. 
If they haven't verified their age (`!user.ageVerified`), and they try to navigate to `/app` (which is `!== '/onboarding/age'`), the `router.push` forcibly redirects them back. The actual page content (`{children}`) is hidden behind a loading state until this check passes.

### D. Real-Time Sockets (`apps/api/src/socket.ts`)
How do two users connect instantly?
```typescript
io.on('connection', async (socket) => {
  const room = `college:${collegeId}`;
  socket.join(room); // Line A

  socket.on('match:search', async (data) => {
    await joinQueue(collegeId, { userId, filter: data.filter, timestamp: Date.now() }); // Line B
  });

  socket.on('session:message', async (data) => {
    const sessionId = await redisClient.get(`active_session:${userId}`); // Line C
    
    // Line D
    const encrypted = encrypt(data.body);
    await prisma.sessionMessage.create({ data: { sessionId, body: encrypted } });

    io.to(otherSocket).emit('session:receive', { body: data.body }); // Line E
  });
});
```
**Explanation:**
- **Line A:** As soon as a WebSocket connects, we put them in a `collegeId` room. This guarantees that broadcasts (like online counts) only go to students in the same college.
- **Line B:** When they click "Find Match", they are dumped into a Redis Queue alongside their `filter` (e.g. "Same Year Only") and a `timestamp` (to ensure whoever waited longest gets matched first). A background loop continuously evaluates this queue.
- **Line C:** Redis acts as our ultra-fast memory bank. When a message is sent, we instantly look up which active session the user belongs to.
- **Line D:** We encrypt the chat message locally before writing it to PostgreSQL. If someone breaches our database, they only see encrypted garbage.
- **Line E:** We emit the plaintext message over the secure WSS (WebSocket Secure) channel directly to the partner's device. 

## The Step-by-Step Build Order (How You Do It)

If you log off right now and decide to build a clone tomorrow, follow this order:
1. **Initialize the Monorepo:** Setup `pnpm` and create the `apps/web` and `apps/api` folders.
2. **The Database:** Write your `schema.prisma`. Deploy a local Postgres container via Docker.
3. **Core API:** Build the `/request-otp` and `/verify-otp` Express routes.
4. **Core Frontend:** Build the Next.js pages and tie them to the API via `fetch`.
5. **The Websocket Loop:** Spin up Socket.IO. Write the logic that pairs two users in Redis.
6. **Polish:** Add the legal consent checks, deploy Sentry for error logging, write your Playwright/Vitest automated tests, and add Dockerfiles for deployment.
