const subjects = [
  { name: "Biology", progress: 72, color: "bg-emerald-400", lessons: "8 of 11 lessons" },
  { name: "Algebra II", progress: 48, color: "bg-violet-400", lessons: "6 of 12 lessons" },
  { name: "World History", progress: 31, color: "bg-amber-400", lessons: "4 of 13 lessons" },
];

const upcoming = [
  { title: "Cellular respiration review", subject: "Biology", time: "Today · 4:00 PM", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Practice quadratic equations", subject: "Algebra II", time: "Tomorrow · 5:30 PM", tone: "bg-violet-50 text-violet-700" },
  { title: "Flashcards: The Renaissance", subject: "World History", time: "Friday · 3:00 PM", tone: "bg-amber-50 text-amber-700" },
];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-8 text-[#19213d] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#5b5ce2] text-xl text-white shadow-lg shadow-indigo-200">✦</div><div><p className="text-lg font-bold tracking-tight">StudyPal</p><p className="text-xs text-slate-500">Your learning, made lighter.</p></div></div><button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">My profile</button></header>
        <section className="mt-12 grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#5b5ce2]">Saturday, October 10</p><h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Small steps make big progress, Maya.</h1><p className="mt-4 max-w-lg text-base leading-7 text-slate-500">You’re building a great rhythm. Keep today simple and focus on one thing at a time.</p></div><div className="rounded-3xl bg-[#19213d] p-6 text-white shadow-xl shadow-slate-200"><div className="flex items-start justify-between"><div><p className="text-sm text-indigo-200">This week</p><p className="mt-2 text-4xl font-bold">4.5 hrs</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100">+18%</span></div><div className="mt-6 h-2 rounded-full bg-white/15"><div className="h-2 w-[68%] rounded-full bg-[#a6e3c1]" /></div><p className="mt-3 text-sm text-indigo-100">You’re 2 sessions away from your weekly goal.</p></div></section>
        <section className="mt-12"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Your subjects</h2><button className="text-sm font-bold text-[#5b5ce2]">View all →</button></div><div className="grid gap-4 md:grid-cols-3">{subjects.map((subject) => <article key={subject.name} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-bold">{subject.name}</h3><span className="text-sm font-bold text-slate-500">{subject.progress}%</span></div><div className="mt-5 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${subject.color}`} style={{ width: `${subject.progress}%` }} /></div><p className="mt-3 text-sm text-slate-400">{subject.lessons}</p></article>)}</div></section>
        <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_.8fr]"><div><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Up next</h2><button className="text-sm font-bold text-[#5b5ce2]">See calendar →</button></div><div className="space-y-3">{upcoming.map((item) => <article key={item.title} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-4"><div className={`grid h-11 w-11 place-items-center rounded-2xl text-lg ${item.tone}`}>✓</div><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-slate-400">{item.subject} · {item.time}</p></div></div><span className="hidden text-slate-300 sm:block">•••</span></article>)}</div></div><div className="rounded-3xl bg-[#e7f7ee] p-7"><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">A little encouragement</p><h2 className="mt-5 text-3xl font-bold leading-tight">Progress isn’t about perfect days.</h2><p className="mt-4 leading-7 text-emerald-900/70">It’s about returning to what matters, one kind choice at a time.</p><button className="mt-7 rounded-full bg-[#19213d] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200">Start a study session</button></div></section>
      </div>
    </main>
  );
}
