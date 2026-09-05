import MaterialIcon from './MaterialIcon';

const logoFor = (name: string) => {
    const ext = name.toLowerCase().split('.').pop() || '';
    if (ext === 'pdf') return '/file-icons/pdf.svg';
    if (['doc', 'docx'].includes(ext)) return '/file-icons/word.svg';
    if (['xls', 'xlsx', 'xlsm'].includes(ext)) return '/file-icons/excel.svg';
    if (['ppt', 'pptx'].includes(ext)) return '/file-icons/powerpoint.svg';
    return null;
};
export default function FileTypeIcon({ name, kind, className = 'text-xl' }: { name: string; kind?: string; className?: string }) {
    const logo = logoFor(name);
    if (logo) return <img src={logo} alt="" aria-hidden="true" className="w-6 h-6 shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
    const ext = name.toLowerCase().split('.').pop() || '';
    const icon = kind === 'folder' ? 'folder' : ['zip','rar','7z','gz'].includes(ext) ? 'folder_zip' : ['png','jpg','jpeg','gif','webp','svg'].includes(ext) ? 'image' : ['mp4','webm','mov'].includes(ext) ? 'movie' : ['mp3','wav','ogg'].includes(ext) ? 'audio_file' : ['csv','tsv'].includes(ext) ? 'table_chart' : ['js','ts','json','html','css','py'].includes(ext) ? 'code' : 'description';
    return <MaterialIcon name={icon} className={`${className} theme-text-faint`} />;
}
