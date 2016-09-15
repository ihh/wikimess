;; https://www.emacswiki.org/emacs/ModeTutorial
;; http://ergoemacs.org/emacs/elisp_syntax_coloring.html

(defvar story-mode-hook nil)

(defvar story-mode-map
  (let ((map (make-keymap)))
    (define-key map "\C-j" 'newline-and-indent)
    map)
  "Keymap for bighouse story major mode")

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.story\\'" . story-mode))

(setq story-field-regexp "#[a-z0-9]+ +\\(.*\\)")

(setq story-highlights
      '(("#[a-z0-9]+" . font-lock-keyword-face)
	("#[a-z0-9]+ +\\(.*\\)" 1 font-lock-function-name-face)
	("^[ \t]*\}[ \t]*$" . font-lock-function-name-face)
	("\\$\\(self\\|other\\|player1\\|player2\\)" . font-lock-constant-face)
	("\{\{.*?\}\}" . font-lock-comment-face)
	("<.*?>" . font-lock-variable-name-face)
        (";;" . font-lock-warning-face)))

(defun story-indent-line ()
  "Indent current line as bighouse story"
  (interactive)
  (beginning-of-line)
  (if (bobp)
      (indent-line-to 0)
    (let ((not-indented t) (story-tab-width 2) cur-indent)
      (if (looking-at "^[ \t]*\\}[ \t]*$")
	  (progn
	    (save-excursion
	      (forward-line -1)
	      (setq cur-indent (- (current-indentation) story-tab-width)))
              (if (< cur-indent 0)
                  (setq cur-indent 0)))
	(save-excursion 
          (while not-indented
            (forward-line -1)
            (if (looking-at "^[ \t]*\\}[ \t]*$")
                (progn
                  (setq cur-indent (current-indentation))
                  (setq not-indented nil))
              (if (looking-at "^[ \t]*#[a-z]+[ \t]*\{[ \t]*$")
                  (progn
                    (setq cur-indent (+ (current-indentation) story-tab-width))
                    (setq not-indented nil))
                (if (bobp)
                    (setq not-indented nil)))))))
      (if cur-indent
          (indent-line-to cur-indent)
        (indent-line-to 0)))))

(defvar story-mode-syntax-table
  (let ((st (make-syntax-table)))
;;    (modify-syntax-entry ?{ "( 12" table)
;;    (modify-syntax-entry ?} ") 34" table)
    (modify-syntax-entry ?/ ". 14" st)
    (modify-syntax-entry ?* ". 23" st)
    st)
  "Syntax table for story-mode")

(defun story-mode ()
  "Major mode for editing bighouse story files"
  (interactive)
  (kill-all-local-variables)
  (set-syntax-table story-mode-syntax-table)
  (use-local-map story-mode-map)
  (setq font-lock-defaults '(story-highlights))
  (set (make-local-variable 'indent-line-function) 'story-indent-line)  
  (set-syntax-table story-mode-syntax-table)
  (setq mode-name "story")
  (run-hooks 'story-mode-hook))

(provide 'story-mode)

;;(define-derived-mode story-mode fundamental-mode
;;  (setq font-lock-defaults '(story-highlights))
;;  (set (make-local-variable 'indent-line-function) 'story-indent-line)  
;;  (set-syntax-table story-mode-syntax-table)
;;  (setq mode-name "story"))
