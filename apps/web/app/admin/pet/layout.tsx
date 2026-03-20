export default function PetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        [data-pet-theme] .bg-brand-primary { background-color: rgb(249 115 22) !important; }
        [data-pet-theme] .border-brand-primary { border-color: rgb(249 115 22) !important; }
        [data-pet-theme] .text-brand-primary { color: rgb(249 115 22) !important; }
        [data-pet-theme] .hover\\:bg-brand-primary:hover { background-color: rgb(234 88 12) !important; }
        [data-pet-theme] .focus\\:border-brand-primary:focus { border-color: rgb(251 146 60) !important; }
        [data-pet-theme] .focus\\:ring-brand-primary:focus { --tw-ring-color: rgb(249 115 22) !important; }
        [data-pet-theme] .focus\\:ring-brand-primary\\/20:focus { --tw-ring-color: rgb(249 115 22 / 0.2) !important; }
        [data-pet-theme] .ring-brand-primary { --tw-ring-color: rgb(249 115 22) !important; }
        [data-pet-theme] .ring-brand-primary\\/20 { --tw-ring-color: rgb(249 115 22 / 0.2) !important; }
        [data-pet-theme] .hover\\:shadow-md:hover { box-shadow: 0 4px 6px -1px rgb(249 115 22 / 0.1), 0 2px 4px -2px rgb(249 115 22 / 0.1) !important; }
        [data-pet-theme] .shadow-soft { box-shadow: 0 10px 30px rgba(249,115,22,0.08) !important; }
        [data-pet-theme] .bg-blue-50 { background-color: rgb(255 247 237) !important; }
        [data-pet-theme] .bg-blue-50\\/50 { background-color: rgb(255 247 237 / 0.5) !important; }
        [data-pet-theme] .bg-blue-100 { background-color: rgb(255 237 213) !important; }
        [data-pet-theme] .border-blue-200 { border-color: rgb(253 186 116) !important; }
        [data-pet-theme] .border-blue-300 { border-color: rgb(253 186 116) !important; }
        [data-pet-theme] .text-blue-500 { color: rgb(249 115 22) !important; }
        [data-pet-theme] .text-blue-600 { color: rgb(234 88 12) !important; }
        [data-pet-theme] .text-blue-700 { color: rgb(194 65 12) !important; }
        [data-pet-theme] .hover\\:bg-blue-50:hover { background-color: rgb(255 247 237) !important; }
        [data-pet-theme] .hover\\:bg-blue-100:hover { background-color: rgb(255 237 213) !important; }
        [data-pet-theme] .bg-indigo-50 { background-color: rgb(255 247 237) !important; }
        [data-pet-theme] .bg-indigo-100 { background-color: rgb(255 237 213) !important; }
        [data-pet-theme] .bg-indigo-500 { background-color: rgb(249 115 22) !important; }
        [data-pet-theme] .bg-indigo-600 { background-color: rgb(234 88 12) !important; }
        [data-pet-theme] .hover\\:bg-indigo-50:hover { background-color: rgb(255 247 237) !important; }
        [data-pet-theme] .hover\\:bg-indigo-100:hover { background-color: rgb(255 237 213) !important; }
        [data-pet-theme] .hover\\:bg-indigo-700:hover { background-color: rgb(194 65 12) !important; }
        [data-pet-theme] .border-indigo-200 { border-color: rgb(253 186 116) !important; }
        [data-pet-theme] .border-indigo-300 { border-color: rgb(253 186 116) !important; }
        [data-pet-theme] .border-indigo-400 { border-color: rgb(251 146 60) !important; }
        [data-pet-theme] .text-indigo-500 { color: rgb(249 115 22) !important; }
        [data-pet-theme] .text-indigo-600 { color: rgb(234 88 12) !important; }
        [data-pet-theme] .text-indigo-700 { color: rgb(194 65 12) !important; }
        [data-pet-theme] .text-indigo-800 { color: rgb(154 52 18) !important; }
        [data-pet-theme] .focus\\:ring-indigo-400:focus { --tw-ring-color: rgb(253 186 116) !important; }
        [data-pet-theme] .focus\\:ring-indigo-500:focus { --tw-ring-color: rgb(251 146 60) !important; }
        [data-pet-theme] .focus\\:border-indigo-500:focus { border-color: rgb(251 146 60) !important; }
        [data-pet-theme] .focus\\:ring-1.focus\\:ring-indigo-500:focus { --tw-ring-color: rgb(251 146 60) !important; }
        [data-pet-theme] .bg-brand-bg { background-color: rgb(255 247 237) !important; }
        [data-pet-theme] .text-brand-muted { color: rgb(194 65 12) !important; }
        [data-pet-theme] .border-brand-border { border-color: rgb(253 186 116) !important; }
        [data-pet-theme] .focus\\:ring-brand-primary\\/20:focus { --tw-ring-color: rgb(249 115 22 / 0.2) !important; }
        [data-pet-theme] .focus\\:border-brand-primary:focus { border-color: rgb(249 115 22) !important; }
      `}</style>
      <div data-pet-theme>
        {children}
      </div>
    </>
  );
}
