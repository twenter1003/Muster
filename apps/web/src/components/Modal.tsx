import { useEffect, useRef, type ReactNode } from 'react';
import './Modal.css';

interface ModalProps {
  open: boolean;
  title: string;
  /** Esc·배경 클릭·닫기 버튼이 모두 이것을 부른다. 저장 중에는 호출자가 막는다. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * 네이티브 `<dialog>`를 쓴다.
 *
 * 직접 만들지 않는 이유: 제대로 된 모달은 포커스를 안에 가두고, Esc로 닫히고, 뒤쪽 내용을
 * 보조기기에서 숨기고, 열릴 때 첫 요소로 포커스를 옮기고, 닫힐 때 원래 자리로 돌려놔야 한다.
 * `showModal()`은 그걸 전부 브라우저가 한다. 손으로 구현하면 그중 두어 개를 빠뜨린 채
 * "동작하는 것처럼 보이는" 모달이 남는다.
 *
 * open을 prop으로 받되 DOM 메서드로 여닫는 이유: `<dialog open>` 속성만 켜면
 * **모달이 아닌** 다이얼로그가 된다(배경이 눌리고 Esc도 안 먹는다). 모달이 되려면
 * 반드시 showModal()을 불러야 한다.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Esc는 dialog가 직접 처리하고 close 이벤트만 준다. 그 사실을 호출자 상태에 반영해야
  // 다음에 열 때 open이 이미 true로 남아 열리지 않는 일이 없다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('close', onClose);
    return () => el.removeEventListener('close', onClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      // 배경(::backdrop)을 누르면 닫는다. dialog 자신이 클릭 대상일 때만이 배경이다 —
      // 안쪽 요소에서 올라온 클릭은 target이 그 요소다.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
