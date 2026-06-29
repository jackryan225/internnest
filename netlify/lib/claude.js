'use strict';
const { toCard } = require('./matcher');

const SYSTEM = `You are an expert internship-matching assistant for college students.
You will be given a student's profile and a numbered list of REAL internships.
Score how well EACH internship fits the student (0-100), and for each return a short reason,
2-3 concrete missing skills the student should build, a one-line application tip, and a short,
ready-to-send outreach message written in the student's voice.
Only use the internships provided - never invent companies, roles, or URLs.
Return ONLY a JSON array, one object per internship you were given, each:
{"index": <number>, "score": <0-100>, "why": "...", "missing": ["...","..."], "tip": "...", "outreach": "..."}`;

function buildMatchPrompt(profile, candidates) {
  const list = candidates.map((c, i) =>
    `${i}. ${c.role} @ ${c.company} | ${c.industry} | ${c.location} | ${c.work_type} | skills: ${(c.required_skills || []).join(', ')}`
  ).join('\n');
  const user = `STUDENT PROFILE
Name: ${profile.name || 'Student'}
School: ${profile.school || ''}
Major: ${profile.major || ''}
Year: ${profile.year || ''}
Target industry: ${profile.industry || ''}
Target role: ${profile.role || ''}
Preferred location: ${profile.location || ''}
Work preference: ${profile.worktype || 'any'}
Skills: ${profile.skills || ''}
Target companies: ${profile.companies || ''}

INTERNSHIPS (score every one, keep the index):
${list}`;
  return { system: SYSTEM, user };
}

function parseMatchResponse(text, candidates) {
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no JSON array in model output');
  let arr;
  try { arr = JSON.parse(m[0]); } catch (e) { throw new Error('bad JSON: ' + e.message); }
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty model output');
  const cards = [];
  for (const item of arr) {
    const c = candidates[item.index];
    if (!c) continue;
    cards.push(toCard(c, {
      score: Math.max(0, Math.min(100, Number(item.score) || 0)),
      why: String(item.why || '').slice(0, 400),
      missing: Array.isArray(item.missing) ? item.missing.slice(0, 3).map(String) : [],
      tip: String(item.tip || '').slice(0, 300),
      outreach: String(item.outreach || '').slice(0, 1200),
    }));
  }
  if (cards.length === 0) throw new Error('no candidates matched model indices');
  return cards.sort((a, b) => b.score - a.score);
}

async function callClaude({ apiKey, system, user, model = 'claude-haiku-4-5-20251001', maxTokens = 2000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error('anthropic ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

module.exports = { buildMatchPrompt, parseMatchResponse, callClaude, SYSTEM };
