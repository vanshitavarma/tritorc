export default function FileList({ files, onRemoveFile, disabled = false }) {
  if (!files || files.length === 0) return null;

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="file-list-card">
      <div className="file-list-header">
        <h4>Selected Documents ({files.length})</h4>
      </div>
      <ul className="file-items">
        {files.map((file, idx) => {
          const isPdf = file.name.toLowerCase().endsWith('.pdf');
          return (
            <li key={`${file.name}-${idx}`} className="file-item">
              <span className={`file-type-pill ${isPdf ? 'pdf' : 'docx'}`}>
                {isPdf ? 'PDF' : 'DOCX'}
              </span>
              <div className="file-info">
                <span className="file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="file-size">{formatSize(file.size)}</span>
              </div>
              <button
                type="button"
                className="btn-remove-file"
                onClick={() => onRemoveFile(idx)}
                disabled={disabled}
                title="Remove file"
              >
                &times;
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
