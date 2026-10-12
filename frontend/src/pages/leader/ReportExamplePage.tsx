import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SelectControl } from '../../components/SelectControl';
import { useReportExampleHelp } from '../../services/report-example-help';
import { REPORT_EXAMPLE_STEPS, type ExampleRow } from './report-example';
import '../../styles/pages.css';
import './ReportExamplePage.css';

function ExampleValues({ rows }: { rows: ExampleRow[] }) {
  return <div className="example-values">
    <div className="example-columns" aria-hidden="true"><span>Показатель</span><span>Март · факт</span><span>Апрель · факт</span><span>Май · план</span></div>
    {rows.map(row => <div className="example-row" key={row.label} role="group" aria-label={row.label}>
      <div className="example-row-label"><strong>{row.label}</strong></div>
      <dl className="example-row-values">
        <div><dt>Март · факт</dt><dd>{row.previous}</dd></div>
        <div className="example-current-value"><dt>Апрель · факт</dt><dd>{row.current}</dd></div>
        <div><dt>Май · план</dt><dd>{row.plan}</dd></div>
      </dl>
      {row.note && <p className="example-row-note">{row.note}</p>}
    </div>)}
  </div>;
}

export default function ReportExamplePage() {
  const navigate = useNavigate();
  const exampleHelp = useReportExampleHelp();
  const { search } = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentTitle = useRef<HTMLHeadingElement>(null);
  const initialRender = useRef(true);
  const steps = REPORT_EXAMPLE_STEPS;
  const current = steps[currentIndex];
  const complete = currentIndex === steps.length - 1;
  const reportPath = '/report' + search;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Пример заполнения отчёта · LRT';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    currentTitle.current?.focus({ preventScroll: true });
    currentTitle.current?.closest('article')?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [currentIndex]);

  function next() {
    setCurrentIndex(index => Math.min(index + 1, steps.length - 1));
  }

  return <div className="page report-example">
    <header className="page-header">
      <div><p className="example-eyebrow">От первого факта до отправки</p><h1 className="page-title">Пример заполнения отчёта</h1><p className="page-sub">Разберите заполненный апрельский отчёт по шагам.</p></div>
      <Link className="btn btn-ghost" to={reportPath}>Вернуться к отчёту</Link>
    </header>

    <div className="example-intro">
      <p>Выберите нужный шаг в списке или проходите пример кнопками «Назад» и «Следующий шаг».</p>
      <p>Это учебный отчёт. Для своего отчёта используйте фактические данные.</p>
    </div>

      <article className="example-report" aria-label="Учебный отчёт за апрель">
        <div className="example-report-heading"><strong>Отчёт за апрель</strong><span>Март → апрель → план мая</span></div>
        <div className="example-navigation">
          <div className="example-step-picker"><span>Шаг примера</span><SelectControl label="Шаг примера" value={currentIndex} onChange={value => setCurrentIndex(Number(value))} options={steps.map((step, index) => ({ value: index, label: `${index + 1}. ${step.title}` }))}/></div>
          <div className="example-progress-area">
            <div className="example-progress-label"><span>Шаг {currentIndex + 1} из {steps.length}</span></div>
            <div className="example-progress" role="progressbar" aria-label="Текущий шаг" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={currentIndex + 1}><span style={{ width: ((currentIndex + 1) / steps.length) * 100 + '%' }} /></div>
          </div>
        </div>
        <section className="example-step is-current" key={current.id} aria-labelledby={'example-title-' + current.id}>
          <div className="example-step-heading"><span className="example-step-number" aria-hidden="true">{String(currentIndex + 1).padStart(2, '0')}</span><div><p className="example-section-name">{current.section}</p><h2 id={'example-title-' + current.id} tabIndex={-1} ref={currentTitle}>{current.title}</h2></div></div>
          <p className="example-instruction">{current.instruction}</p>
          {current.rows && <ExampleValues rows={current.rows} />}
          {current.checklist && <ul className="example-checklist">{current.checklist.map(item => <li key={item}>{item}</li>)}</ul>}
          {current.analysis && <details className="example-analysis" open>
            <summary>Пример анализа</summary>
            <dl>{current.analysis.map(answer => <div key={answer.label}><dt>{answer.label}</dt><dd>{answer.text}</dd></div>)}</dl>
          </details>}
          {complete && <div className="example-colors" aria-label="Цвета после сохранения"><span className="example-zone green">Целевая зона</span><span className="example-zone yellow">Ниже цели</span><span className="example-zone red">Критично</span></div>}
            {current.tip && <div className="example-tip"><strong>Обратите внимание</strong><p>{current.tip}</p></div>}
            <div className="example-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCurrentIndex(previous => Math.max(0, previous - 1))} disabled={currentIndex === 0}>Назад</button>
              {complete ? <Link className="btn btn-primary" to={reportPath} aria-disabled={!exampleHelp.canSave} onClick={async event => { event.preventDefault(); if (await exampleHelp.dismiss()) navigate(reportPath); }}>Заполнить свой отчёт</Link> : <button type="button" className="btn btn-primary" onClick={next}>Следующий шаг</button>}
            </div>
            {exampleHelp.error && <p className="error" role="alert">{exampleHelp.error}</p>}
            {complete && <p className="example-complete">Вернуться к нужному шагу можно через список сверху.</p>}
        </section>
      </article>
  </div>;
}
