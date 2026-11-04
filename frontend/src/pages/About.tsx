import { ArrowRight, Check, Cpu, Database, FileText, GraduationCap, Layers, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { projectConfig } from "../config/project";

const OBJECTIVES = [
  "Simplify legal document understanding.",
  "Identify important legal clauses.",
  "Extract obligations and conditions.",
  "Highlight potentially risky terms.",
  "Reduce the time required for preliminary document analysis.",
];

const STACK = [
  { group: "Frontend", items: ["React.js", "TypeScript", "Vite", "Tailwind CSS", "React Router", "Axios", "Recharts", "Lucide icons"] },
  { group: "Backend", items: ["Python", "FastAPI", "Pydantic", "SQLAlchemy", "Uvicorn"] },
  { group: "AI & NLP", items: ["LLM provider abstraction (Anthropic Claude / NVIDIA / OpenAI-compatible)", "Structured JSON prompts", "Rule-based validation", "Chunking & synthesis"] },
  { group: "Data & documents", items: ["SQLite", "PyMuPDF", "python-docx"] },
];

const PIPELINE = [
  { icon: FileText, title: "Upload & validate", text: "Type, size, MIME and signature checks" },
  { icon: Layers, title: "Extract & chunk", text: "Page-aware text, cleaned and split with overlap" },
  { icon: Cpu, title: "LLM analysis", text: "Clauses, parties, payments, dates and risks per chunk" },
  { icon: ShieldCheck, title: "Validate & verify", text: "Schema validation, quotes matched to source pages" },
  { icon: Database, title: "Store & display", text: "Saved to the database and shown in the dashboard" },
];

const FUTURE = [
  "OCR-based analysis of scanned documents",
  "Multiple language support",
  "Question-answering over uploaded documents",
  "Voice-based document explanation",
  "Advanced risk scoring",
  "Integration with updated legal databases and laws",
  "Multi-document comparison",
  "Explanations personalised to the reader's knowledge level",
];

function SectionHeading({ children }: { children: string }) {
  return <h3 className="font-serif text-2xl font-semibold text-navy-950">{children}</h3>;
}

export default function About() {
  const team = projectConfig.team;
  const details = [
    ["Course", projectConfig.course],
    ["Institution", projectConfig.institution],
    ["Academic year", projectConfig.academicYear],
    ["Project guide", projectConfig.guide],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-14">
      <div>
        <section className="relative overflow-hidden rounded-3xl bg-navy-950 px-6 pt-12 pb-28 text-white shadow-lift sm:px-12 sm:pt-16">
          <div className="ruled-lines pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative max-w-3xl">
            <h2 className="font-serif text-4xl leading-[1.1] font-semibold text-balance sm:text-5xl">{projectConfig.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-navy-200">
              An AI-based application designed to simplify legal documents using Natural Language Processing and Large Language Models. Users upload a
              contract, agreement, policy or notice and receive a structured, plain-language analysis whose findings are traced back to the source text.
            </p>
            <Link to="/analyze" className="btn mt-7 bg-white text-navy-900 hover:bg-accent-50">
              Try it on a document <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <figure className="relative mx-3 -mt-16 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift sm:mx-10">
          <div className="grid md:grid-cols-2">
            <blockquote className="border-b border-slate-200 bg-slate-50/70 p-6 md:border-r md:border-b-0 sm:p-7">
              <p className="mb-2 text-sm font-medium text-slate-500">The document says</p>
              <p className="font-serif text-xl leading-relaxed text-slate-800">
                “The lessee shall remit the monthly consideration on or before the fifth day of each calendar month.”
              </p>
            </blockquote>
            <div className="p-6 sm:p-7">
              <p className="mb-2 text-sm font-medium text-teal-700">In plain English</p>
              <p className="text-xl leading-relaxed font-medium text-navy-950">The tenant must pay the monthly rent on or before the 5th of every month.</p>
            </div>
          </div>
          <figcaption className="border-t border-slate-200 px-6 py-2.5 text-xs text-slate-500 sm:px-7">Illustrative example of a plain-language explanation.</figcaption>
        </figure>
      </div>

      <section className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionHeading>The problem</SectionHeading>
          <p className="mt-4 max-w-[62ch] font-serif text-xl leading-9 text-slate-700">
            Legal documents contain dense terminology, long paragraphs and conditions that are easy to miss. People without legal training often sign
            agreements without fully understanding their obligations, penalties, deadlines or one-sided terms.
          </p>
          <p className="mt-4 max-w-[62ch] leading-relaxed text-slate-600">
            This project provides an assistive tool for a fast, preliminary understanding. It does not replace professional legal advice.
          </p>
        </div>
        <div className="lg:col-span-2">
          <SectionHeading>Objectives</SectionHeading>
          <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {OBJECTIVES.map((o) => (
              <li key={o} className="flex gap-3 py-3 text-[15px] text-slate-700">
                <Check className="mt-0.5 size-[18px] shrink-0 text-accent-600" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-3xl bg-navy-50/70 px-6 py-9 ring-1 ring-navy-100 sm:px-10">
        <SectionHeading>How a document is analysed</SectionHeading>
        <ol className="relative mt-8 grid gap-7 md:grid-cols-5 md:gap-5">
          <span className="absolute top-2 bottom-2 left-5 w-px bg-navy-200 md:top-5 md:right-[10%] md:bottom-auto md:left-[10%] md:h-px md:w-auto" aria-hidden />
          {PIPELINE.map(({ icon: Icon, title, text }) => (
            <li key={title} className="relative flex gap-4 md:block md:text-center">
              <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-navy-900 text-white shadow-card ring-4 ring-navy-50 md:mx-auto">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="block md:mt-4">
                <span className="block text-sm font-semibold text-navy-950">{title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionHeading>Technology stack</SectionHeading>
        <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {STACK.map((s) => (
            <div key={s.group} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <dt className="pt-1 text-sm font-semibold text-navy-900">{s.group}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {s.items.map((i) => <span key={i} className="rounded-lg bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700 ring-1 ring-slate-200">{i}</span>)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h3 className="flex items-center gap-2.5 font-serif text-2xl font-semibold text-navy-950">
            <GraduationCap className="size-6 text-navy-500" aria-hidden /> Project team
          </h3>
          {details.length > 0 && (
            <dl className="mt-4 space-y-2 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-slate-800">{v}</dd></div>
              ))}
            </dl>
          )}
          {team.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {team.map((m) => (
                <li key={m.name} className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-900 font-semibold text-white">{m.name[0]}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{m.name}</span>
                    {(m.role || m.id) && <span className="block truncate text-xs text-slate-500">{[m.role, m.id].filter(Boolean).join(" · ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Team details have not been configured. Add names, institution and guide in <code className="text-xs">frontend/src/config/project.ts</code>.
            </p>
          )}
        </section>

        <section>
          <SectionHeading>Future scope</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">Planned extensions, not part of the current version.</p>
          <ul className="mt-4 grid gap-x-6 sm:grid-cols-2">
            {FUTURE.map((f) => <li key={f} className="border-b border-slate-200 py-2.5 text-sm text-slate-600">{f}</li>)}
          </ul>
        </section>
      </div>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        <b>Disclaimer:</b> analysis produced by this application is preliminary and informational. It is not legal advice and must not be relied upon as a
        determination of the legal validity or enforceability of any document.
      </p>
    </div>
  );
}
