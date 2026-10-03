// The resume, as the summit rail and its glass panels show it. One entry per rail item, in
// rail order; both the rail labels and the panel bodies render from this array, so editing a
// section is an edit here and nowhere else.
//
// The wording is Evan's resume verbatim. Layout is the only edit allowed: a comma list may
// become separate items, a placing may be split into badges. Do not reword or add detail
// (see content.ts). His phone number is deliberately not on the site.
//
// © 2026 Evan Bhandari. All rights reserved. The copy in src/content/ is not covered by the
// MIT License in LICENSE; see "License" in README.md.

export type SectionId = 'experience' | 'projects' | 'competitions' | 'education' | 'skills' | 'leadership' | 'contact'

export interface ResumeLink {
  label: string
  href: string
}

/** One job, project or competition. */
export interface ResumeEntry {
  /** Organization, project or event. */
  title: string
  /** Position held, or the event a project was built for. */
  role?: string
  /** Competition placings, the headline one first. Rendered as badges. */
  placements?: string[]
  when?: string
  where?: string
  link?: ResumeLink
  bullets: string[]
}

export interface Education {
  school: string
  where: string
  degree: string
  when: string
  gpa: string
  honors: string[]
}

export interface SkillGroup {
  label: string
  items: string[]
}

export interface ContactLink {
  /** What it is: Email, LinkedIn... */
  label: string
  /** What it shows: the address itself. */
  value: string
  href: string
}

interface SectionBase {
  /** Also the URL hash that opens the section (#experience). */
  id: SectionId
  /** The rail label: short, set in capitals by CSS. */
  label: string
  /** The panel heading. */
  title: string
  /** Shown beside the panel heading. */
  devanagari: string
}

export type ResumeSection =
  | (SectionBase & { kind: 'entries'; entries: ResumeEntry[] })
  | (SectionBase & { kind: 'education'; education: Education })
  | (SectionBase & { kind: 'skills'; groups: SkillGroup[] })
  | (SectionBase & { kind: 'contact'; links: ContactLink[] })

/** Words the rail and panels use that are not resume content. */
export const RESUME_UI = {
  navLabel: 'Resume',
  close: 'Close',
} as const

const EMAIL = 'bhandari.nirwan06@gmail.com'

export const RESUME: ResumeSection[] = [
  {
    id: 'experience',
    label: 'Experience',
    title: 'Experience',
    devanagari: 'अनुभव',
    kind: 'entries',
    entries: [
      {
        title: 'Cybersecurity Operations Center, Dakota State University',
        role: 'Cybersecurity Analyst',
        when: 'Sept 2026 – Present',
        where: 'Madison, SD',
        bullets: [
          "Monitor and analyze Tier 1 security events using Microsoft Defender and Entra ID within DSU's Cyber Security Operations Center, investigating potential threats and executing incident response actions such as revoking compromised sessions and locking down access.",
          'Conduct proactive threat hunts using KQL queries in Microsoft Defender Advanced Hunting, reviewing historical security events to identify attack patterns and indicators missed by automated alerting.',
          "Collaborate within an Agile-aligned SOC team through daily stand-ups, documenting investigation findings and escalating confirmed incidents to senior analysts, experience directly informing how attacker activity looks from the defender's side.",
        ],
      },
      {
        title: 'Cyber Camp, Dakota State University',
        role: 'Student Leader',
        when: 'Jun 2026',
        bullets: [
          'Supervised and mentored 50+ middle school campers through a 4-day residential camp covering cybersecurity, AI, and computer science, strictly managing daily schedules and student well-being.',
        ],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    title: 'Projects',
    devanagari: 'परियोजना',
    kind: 'entries',
    entries: [
      {
        title: 'Terminal Quest',
        role: 'Ignite Hackathon',
        link: { label: 'github.com/evanbh256/terminal-quest', href: 'https://github.com/evanbh256/terminal-quest' },
        bullets: [
          'Independently continued development into a full-stack browser-based dungeon RPG that transforms the filesystem into the game world, using native Linux commands (ls, cd, mv, find) to drive movement, item discovery, and room transitions.',
        ],
      },
      {
        title: 'HandAll',
        role: 'Nepal-US Hackathon',
        link: { label: 'github.com/evanbh256/HandAll', href: 'https://github.com/evanbh256/HandAll' },
        bullets: [
          'Developed an AI-powered student planner leveraging multi-agent orchestration to decompose complex assignments into burnout-aware task blocks, with Google Calendar OAuth and iCal synchronization.',
        ],
      },
    ],
  },
  {
    id: 'competitions',
    label: 'Competitions',
    title: 'Competitions',
    devanagari: 'प्रतिस्पर्धा',
    kind: 'entries',
    entries: [
      {
        title: 'eCitadel Cyber Defence Competition',
        placements: ['Participant'],
        when: 'Jun 2026',
        bullets: [
          'Assessed and defended an Active Directory Domain Controller against live, adversarial Red Team activity, identifying and remediating security control gaps in real time.',
          'Strengthened Windows Server security posture by auditing user accounts, revoking unauthorized access, and deploying Sysmon for continuous log monitoring and threat detection.',
        ],
      },
      {
        title: 'HiveCTF',
        placements: ['4th Place Overall', '1st Place (DSU Bracket)'],
        when: 'Apr 2026',
        bullets: [
          'Placed 4th overall and 1st within the university bracket in an open Capture the Flag competition by solving web exploitation, cryptography, and reverse engineering challenges under strict time constraints.',
        ],
      },
      {
        title: 'NCAE Cyber Games 2026',
        placements: ['5th Place', 'Regionals (Database & Router)'],
        when: 'Feb 2026',
        bullets: [
          'Achieved 5th place regionally in a simulated enterprise network defense competition, maintaining critical database and routing services under sustained adversarial pressure.',
          'Monitored network traffic and analyzed attack patterns in real time to identify, investigate, and mitigate live threats, sustaining continuous operational uptime.',
        ],
      },
      {
        title: 'SillyCTF',
        placements: ['6th Place Overall'],
        when: 'Apr 2026',
        bullets: [
          'Solved advanced OSINT and cryptography challenges to secure 6th place overall in a globally accessible technical competition hosted by Penn State.',
        ],
      },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    title: 'Education',
    devanagari: 'शिक्षा',
    kind: 'education',
    education: {
      school: 'Dakota State University',
      where: 'Madison, SD',
      degree: 'B.S. Cyber Operations, Minor in Network Security Administration',
      when: 'Aug 2024 – Dec 2027',
      gpa: 'GPA: 3.8',
      honors: ['Honors Program', "President's Academic Honors List", 'DSU Rising & Champion Scholarship'],
    },
  },
  {
    id: 'skills',
    label: 'Skills',
    title: 'Skills',
    devanagari: 'सीप',
    kind: 'skills',
    groups: [
      {
        label: 'Security Tools & Frameworks',
        items: [
          'Microsoft Defender',
          'Microsoft Defender Advanced Hunting',
          'Entra ID',
          'Threat Hunting',
          'Incident Response',
          'SOC Alert Triage',
          'Active Directory Hardening',
          'Email & Phishing Security',
        ],
      },
      { label: 'Operating Systems', items: ['Linux', 'Windows Server', 'macOS'] },
      { label: 'Languages', items: ['Python', 'C', 'C++', 'HTML', 'CSS', 'JavaScript', 'TypeScript'] },
    ],
  },
  {
    id: 'leadership',
    label: 'Leadership',
    title: 'Leadership & Activities',
    devanagari: 'नेतृत्व',
    kind: 'entries',
    entries: [
      {
        title: 'DSU CTF Club',
        role: 'Intern',
        when: 'Sept 2026 – Present',
        bullets: ['Lead weekly club meetings, teaching members new Capture the Flag techniques and categories.'],
      },
    ],
  },
  {
    id: 'contact',
    label: 'Contact',
    title: 'Contact',
    devanagari: 'सम्पर्क',
    kind: 'contact',
    links: [
      { label: 'Email', value: EMAIL, href: `mailto:${EMAIL}` },
      { label: 'LinkedIn', value: 'linkedin.com/in/evan-bhandari', href: 'https://www.linkedin.com/in/evan-bhandari' },
      { label: 'GitHub', value: 'github.com/evanbh256', href: 'https://github.com/evanbh256' },
      { label: 'Website', value: 'evanbhandari.com.np', href: 'https://evanbhandari.com.np' },
    ],
  },
]

/** The section a URL hash names, or undefined. */
export function sectionFromHash(hash: string): ResumeSection | undefined {
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  return RESUME.find((s) => s.id === id)
}
