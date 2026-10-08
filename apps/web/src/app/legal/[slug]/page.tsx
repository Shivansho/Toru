import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { notFound } from 'next/navigation';
import { LEGAL_CONFIG } from '@shared/core';

interface LegalPageProps {
  params: { slug: string };
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug } = await Promise.resolve(params);
  const contentPath = path.join(process.cwd(), 'content', 'legal', `${slug}.md`);

  try {
    if (!fs.existsSync(contentPath)) {
      notFound();
    }
    
    let fileContents = fs.readFileSync(contentPath, 'utf8');
    
    // Inject Grievance Officer Details
    if (slug === 'grievance-officer') {
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', LEGAL_CONFIG.grievanceOfficer.name);
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', LEGAL_CONFIG.grievanceOfficer.address);
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', LEGAL_CONFIG.grievanceOfficer.email);
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', `Process: Email to report a grievance. Acknowledgment within ${LEGAL_CONFIG.grievanceOfficer.responseTimes.acknowledgment}.`);
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', 'Details required: Date, involved aliases, specifics of violation.');
      fileContents = fileContents.replace('[LAWYER TO COMPLETE]', `Resolution time: within ${LEGAL_CONFIG.grievanceOfficer.responseTimes.resolution}.`);
    }

    const { data, content } = matter(fileContents);
    
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 pt-8 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-8 border-b pb-4">
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Legal Document</h1>
            <div className="text-sm text-slate-500 space-x-4">
              <span>Version: {data.version}</span>
              <span>Effective Date: {data.effectiveDate}</span>
            </div>
          </div>
          <article className="prose prose-slate prose-lg max-w-none">
            {content.split('\n').map((line, i) => {
              if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold mt-8 mb-4">{line.replace('# ', '')}</h1>;
              if (line.startsWith('## ')) return <h2 key={i} className="text-2xl font-bold mt-6 mb-3">{line.replace('## ', '')}</h2>;
              if (line.startsWith('- ')) return <li key={i} className="ml-4 mb-2">{line.replace('- ', '')}</li>;
              if (line.trim() === '') return <br key={i} />;
              if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="italic text-slate-600 mb-4">{line.replace(/\*/g, '')}</p>;
              
              const parts = line.split(/(\*\*.*?\*\*)/g);
              const formattedLine = parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={index}>{part.slice(2, -2)}</strong>;
                }
                return <span key={index}>{part}</span>;
              });

              return <p key={i} className="mb-4 leading-relaxed">{formattedLine}</p>;
            })}
          </article>
        </div>
      </div>
    );
  } catch (error) {
    console.error(error);
    notFound();
  }
}
