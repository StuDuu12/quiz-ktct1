const fs = require('fs');

let content = fs.readFileSync('src/features/practice/components/practice-session.tsx', 'utf8');

const startTag = '<section\\n          className="practice-question-card"';
const endTag = '<aside className="practice-navigator-panel">';

const regex = new RegExp((<section\\s+className="practice-question-card"[\\s\\S]*?)(?=<aside className="practice-navigator-panel">));

const replacement = <section
          className="practice-question-card"
          aria-labelledby="practice-question-title"
        >
          {visibleQuestions.length > 1 && visiblePassage ? (
            <div className="prose mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
              {visiblePassage}
            </div>
          ) : null}

          {visibleQuestions.map((q, vIdx) => {
            const answer = state.answers[q.id];
            const qIndex = state.questionOrder.indexOf(q.id);
            const isGrouped = visibleQuestions.length > 1;
            const questionText = isGrouped ? getQuestionText(q.content) : q.content;

            return (
              <div key={q.id} className={isGrouped ? "mb-12 border-b border-slate-200 pb-8 last:border-0 last:pb-0" : ""}>
                <div className="question-toolbar">
                  <span>Câu {qIndex + 1} / {state.questions.length}</span>
                  <button
                    type="button"
                    className={answer?.flagged ? "flag-button is-active" : "flag-button"}
                    aria-pressed={Boolean(answer?.flagged)}
                    onClick={() => toggleFlag(q.id)}
                  >
                    <Flag
                      size={18}
                      weight={answer?.flagged ? "fill" : "regular"}
                    />
                    {answer?.flagged ? "Đã đặt cờ" : "Đặt cờ"}
                    {!isGrouped && <kbd>F</kbd>}
                  </button>
                </div>

                <h1 id={\practice-question-title-\\}>{questionText}</h1>
                <fieldset className="option-list">
                  <legend className="visually-hidden">Các phương án trả lời</legend>
                  {q.options.map((option, index) => {
                    const selected = answer?.optionId === option.id;
                    const isActuallyCorrect = answer?.showFeedback && answer?.correctOptionId === option.id;
                    const correctness =
                      (selected && answer?.isCorrect === true) || isActuallyCorrect
                        ? " is-correct"
                        : selected && answer?.isCorrect === false
                          ? " is-incorrect"
                          : "";
                    return (
                      <label
                        key={option.id}
                        className={\practice-option\\\\}
                      >
                        <input
                          className="native-option-input"
                          type="radio"
                          name={\practice-answer-\\}
                          value={option.id}
                          aria-label={\Phương án \: \\}
                          aria-checked={selected}
                          checked={selected}
                          disabled={Boolean(answer?.locked)}
                          onChange={() => chooseOption(q.id, option.id)}
                        />
                        <span className="option-key">{index + 1}</span>
                        <span className="option-label">{option.content}</span>
                        <span className="option-letter">{option.label}</span>
                      </label>
                    );
                  })}
                </fieldset>

                {answer?.showFeedback &&
                typeof answer.isCorrect === "boolean" ? (
                  <section
                    className={answer.isCorrect ? "feedback feedback-correct" : "feedback feedback-incorrect"}
                    aria-live="polite"
                  >
                    {answer.isCorrect ? (
                      <CheckCircle size={23} weight="fill" />
                    ) : (
                      <XCircle size={23} weight="fill" />
                    )}
                    <div>
                      <strong>{answer.isCorrect ? "Chính xác" : "Chưa chính xác"}</strong>
                      <p>{answer.explanation || "Chưa có lời giải cho câu hỏi này."}</p>
                      {!answer.isCorrect && answer.correctOptionId ? (
                        <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                          Đáp án đúng là: {q.options.find(o => o.id === answer.correctOptionId)?.content}
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {error && answer?.optionId && saveStatus === "error" ? (
                  <div className="practice-error" role="alert">
                    <WarningCircle size={20} />
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void persistAnswer(
                          q.id,
                          q.attemptQuestionId,
                          answer.optionId
                        )
                      }
                    >
                      Thử lại
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!error && saveStatus === "error" ? (
            <div className="practice-error" role="alert">
               <WarningCircle size={20} />
               <span>Chưa lưu được đáp án. Kiểm tra kết nối và thử lại.</span>
            </div>
          ) : null}

          <footer className="question-actions">
            <button
              type="button"
              disabled={currentGroupStart === 0}
              onClick={() => goToQuestion(currentGroupStart - 1)}
            >
              <ArrowLeft size={18} /> Câu trước
            </button>
            {currentGroupEnd < state.questions.length - 1 ? (
              <button
                type="button"
                className="next-button"
                onClick={() => goToQuestion(currentGroupEnd + 1)}
              >
                Câu tiếp <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="finish-button"
                onClick={openReview}
              >
                Kết thúc
              </button>
            )}
          </footer>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '16px' }}>
            <button
              type="button"
              className="finish-link"
              onClick={openReview}
            >
              Kết thúc
            </button>
            <Link
              href={\/courses/\\}
              className="save-link"
              style={{ fontWeight: 500, color: 'var(--text-secondary)' }}
            >
              Lưu & thoát
            </Link>
          </div>
        </section>
        ;

content = content.replace(regex, replacement);
fs.writeFileSync('src/features/practice/components/practice-session.tsx', content, 'utf8');
console.log('done!');
