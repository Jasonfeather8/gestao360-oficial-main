import type { Dispatch, SetStateAction } from 'react';

interface LancamentosPaginationProps {
  filteredCount: number;
  totalCount: number;
  pageSize: 50 | 100 | 'all';
  currentPage: number;
  totalPages: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
}

export default function LancamentosPagination({
  filteredCount,
  totalCount,
  pageSize,
  currentPage,
  totalPages,
  setCurrentPage
}: LancamentosPaginationProps) {
  return (
    <>
      {/* Pagination Bar */}
      <div className="bg-neutral-50/50 px-8 py-4 border-t border-neutral-100 flex items-center justify-between rounded-b-[32px]">
        <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
          Exibindo {filteredCount} de {totalCount} registros
        </span>

        <div className="flex items-center gap-2">
          {pageSize !== 'all' && (
            <>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
              >
                Anterior
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                        currentPage === pageNum
                          ? 'bg-neutral-900 text-white shadow-md'
                          : 'border-2 border-neutral-100 text-neutral-400 hover:bg-neutral-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 5 && <span className="flex items-end pb-2 text-neutral-400">...</span>}
              </div>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
              >
                Próximo
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
