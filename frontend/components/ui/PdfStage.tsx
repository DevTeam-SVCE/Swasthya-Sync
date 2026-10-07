"use client";

import React, { useEffect, useRef, useState } from "react";
import { Eraser, Hand, Maximize2, Minimize2, PenLine, Redo2, Save, Undo2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import styles from "./PdfStage.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

type PageDimensions = {
  width: number;
  height: number;
};

type AnnotationStroke = {
  pageNumber?: number;
  points: { x: number; y: number }[];
  color?: string;
  thickness?: number;
};

type AnnotationCanvasProps = {
  strokes?: AnnotationStroke[];
  onChange?: (strokes: AnnotationStroke[], pageNumber?: number) => void;
  onSave?: () => void;
  onUndo?: (pageNumber: number) => void;
  onRedo?: (pageNumber: number) => void;
  canUndo?: (pageNumber: number) => boolean;
  canRedo?: (pageNumber: number) => boolean;
  saving?: boolean;
  pageNumber?: number;
  tool?: "pen" | "eraser";
  penColor?: string;
  penThickness?: number;
  eraserThickness?: number;
  onActivatePage?: (pageNumber: number) => void;
};

type PdfStageProps = {
  src?: string;
  title?: string;
  header?: React.ReactNode;
  annotation?: React.ReactNode;
  pdfUrl?: string;
  patient?: unknown;
  formTitle?: string;
  onSwipe?: (direction: -1 | 1) => Promise<void> | void;
  renderAnnotations?: (
    pageNumber: number,
    scale: number,
    width: number,
    height: number
  ) => React.ReactNode;
};

export function PdfStage({
  src,
  title,
  header,
  annotation,
  pdfUrl,
  patient,
  formTitle,
  onSwipe,
  renderAnnotations,
}: PdfStageProps) {
  const resolvedSrc = src ?? pdfUrl ?? "";
  const viewerRef = useRef<HTMLDivElement>(null);
  const headerAreaRef = useRef<HTMLDivElement>(null);
  const [loadedDocument, setLoadedDocument] = useState<{ key: string; pageCount: number } | null>(null);
  const [pageDimensions, setPageDimensions] = useState<Record<number, PageDimensions>>({});
  const [containerWidth, setContainerWidth] = useState(800);
  const [headerContentHeight, setHeaderContentHeight] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [tool, setTool] = useState<"hand" | "pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState("#2563eb");
  const [penThickness, setPenThickness] = useState(2);
  const [eraserThickness, setEraserThickness] = useState(18);
  const [maximized, setMaximized] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeInProgressRef = useRef(false);
  const documentKey = resolvedSrc || "empty-pdf";
  const pageCount = loadedDocument?.key === documentKey ? loadedDocument.pageCount : 0;
  const documentTitle = title ?? formTitle ?? (patient ? "Patient form" : "Form");
  const annotationProps = React.isValidElement(annotation)
    ? annotation.props as AnnotationCanvasProps
    : undefined;
  const allStrokes = Array.isArray(annotationProps?.strokes) ? annotationProps.strokes : [];

  const handlePageStrokeChange = (pageNumber: number, pageStrokes: AnnotationStroke[]) => {
    const onChange = annotationProps?.onChange;
    if (!onChange) return;
    const otherPageStrokes = allStrokes.filter((stroke) => getStrokePageNumber(stroke) !== pageNumber);
    const invalidPageStrokes = allStrokes.filter((stroke) =>
      getStrokePageNumber(stroke) === pageNumber && !isRenderableStroke(stroke)
    );
    onChange([
      ...otherPageStrokes,
      ...invalidPageStrokes.map((stroke) => stroke && typeof stroke === "object" ? { ...stroke, pageNumber } : stroke),
      ...pageStrokes.map((stroke) => ({ ...stroke, pageNumber })),
    ], pageNumber);
  };

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const updateSize = () => {
      const styles = window.getComputedStyle(element);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      setContainerWidth(Math.max(1, element.clientWidth - horizontalPadding));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const area = headerAreaRef.current;
    const headerElement = area?.firstElementChild;
    if (!area || !headerElement) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeaderContentHeight(entry.target.getBoundingClientRect().height);
    });
    observer.observe(headerElement);
    return () => observer.disconnect();
  }, [header, containerWidth]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || pageCount === 0) return;
    const visiblePages = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (entry.isIntersecting) visiblePages.set(pageNumber, entry.intersectionRatio);
        else visiblePages.delete(pageNumber);
      }
      const mostVisible = [...visiblePages.entries()].sort((first, second) => second[1] - first[1])[0];
      if (mostVisible) setActivePage(mostVisible[0]);
    }, { root: viewer, threshold: [0, 0.25, 0.5, 0.75, 1] });
    viewer.querySelectorAll<HTMLElement>("[data-page-number]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pageCount, documentKey]);

  const getPageDimensions = (pageNumber: number): PageDimensions => {
    return pageDimensions[pageNumber] ?? { width: 595, height: 842 };
  };

  const handlePageLoadSuccess = (pageNumber: number, page: { originalWidth?: number; originalHeight?: number; width?: number; height?: number }) => {
    const width = page.originalWidth ?? page.width ?? 595;
    const height = page.originalHeight ?? page.height ?? 842;
    setPageDimensions((previous) => ({
      ...previous,
      [pageNumber]: { width, height },
    }));
  };

  const resolvedContainerWidth = containerWidth;
  const navigateBySwipe = async (deltaX: number, deltaY: number) => {
    if (!onSwipe || tool !== "hand" || swipeInProgressRef.current || Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    swipeInProgressRef.current = true;
    try {
      await onSwipe(deltaX < 0 ? 1 : -1);
    } finally {
      swipeInProgressRef.current = false;
    }
  };

  return (
    <div className={`${styles.stage} ${maximized ? styles.stageMaximized : ""}`}>
      {annotationProps && <div className={styles.toolbar} role="toolbar" aria-label="PDF annotation tools">
        <div className={styles.toolGroup}>
          {onSwipe && <button type="button" className={`${styles.toolButton} ${tool === "hand" ? styles.toolButtonActive : ""}`} onClick={() => setTool("hand")} aria-label="Hand / swipe between forms" aria-pressed={tool === "hand"} title="Hand / swipe between forms"><Hand size={16} /><span>Hand</span></button>}
          <button type="button" className={`${styles.toolButton} ${tool === "pen" ? styles.toolButtonActive : ""}`} onClick={() => setTool("pen")} aria-label="Pen" aria-pressed={tool === "pen"} title="Pen"><PenLine size={16} /><span>Pen</span></button>
          <button type="button" className={`${styles.toolButton} ${tool === "eraser" ? styles.toolButtonActive : ""}`} onClick={() => setTool("eraser")} aria-label="Eraser" aria-pressed={tool === "eraser"} title="Eraser"><Eraser size={16} /><span>Eraser</span></button>
        </div>
        <label className={styles.rangeControl}>Pen size <input type="range" min="1" max="20" value={penThickness} onChange={(event) => setPenThickness(Number(event.target.value))} aria-label="Pen thickness" /><output>{penThickness}px</output></label>
        <label className={styles.rangeControl}>Erase size <input type="range" min="1" max="40" value={eraserThickness} onChange={(event) => setEraserThickness(Number(event.target.value))} aria-label="Eraser thickness" /><output>{eraserThickness}px</output></label>
        <label className={styles.colorControl}>Colour <input type="color" value={penColor} onChange={(event) => setPenColor(event.target.value)} aria-label="Pen colour" /></label>
        <div className={styles.toolGroup}>
          <button type="button" className={styles.iconButton} onClick={() => annotationProps.onUndo?.(activePage)} disabled={!annotationProps.canUndo?.(activePage)} aria-label="Undo" title="Undo"><Undo2 size={16} /></button>
          <button type="button" className={styles.iconButton} onClick={() => annotationProps.onRedo?.(activePage)} disabled={!annotationProps.canRedo?.(activePage)} aria-label="Redo" title="Redo"><Redo2 size={16} /></button>
          <button type="button" className={styles.actionButton} onClick={() => annotationProps.onSave?.()} disabled={!annotationProps.onSave || annotationProps.saving} title="Save"><Save size={15} /><span>{annotationProps.saving ? "Saving..." : "Save"}</span></button>
          <button type="button" className={styles.iconButton} onClick={() => setMaximized((value) => !value)} aria-label={maximized ? "Minimize PDF editor" : "Maximize PDF editor"} title={maximized ? "Minimize" : "Maximize"}>{maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        </div>
      </div>}
      <div
        ref={viewerRef}
        className={styles.viewer}
        onTouchStart={(event) => {
          if (onSwipe && tool === "hand") touchStartRef.current = { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (start) void navigateBySwipe((event.changedTouches[0]?.clientX ?? start.x) - start.x, (event.changedTouches[0]?.clientY ?? start.y) - start.y);
        }}
        onPointerDown={(event) => {
          if (onSwipe && tool === "hand" && event.pointerType !== "touch" && event.button === 0) {
            pointerStartRef.current = { x: event.clientX, y: event.clientY };
          }
        }}
        onPointerUp={(event) => {
          const start = pointerStartRef.current;
          pointerStartRef.current = null;
          if (start) void navigateBySwipe(event.clientX - start.x, event.clientY - start.y);
        }}
        onPointerCancel={() => { pointerStartRef.current = null; }}
      >
        <Document
          key={documentKey}
          file={resolvedSrc}
          onLoadSuccess={({ numPages }) => setLoadedDocument({ key: documentKey, pageCount: numPages })}
          onLoadError={() => setLoadedDocument({ key: documentKey, pageCount: 0 })}
          loading={<div className={styles.loading}>Loading form...</div>}
          error={<div className={styles.error}>Unable to load PDF.</div>}
        >
          <div className={styles.documentPages}>
            {Array.from({ length: pageCount }, (_, index) => {
            const pageNumber = index + 1;
            const dimensions = getPageDimensions(pageNumber);
            const originalWidth = dimensions.width;
            const originalHeight = dimensions.height;
            const pdfRatio = originalHeight / originalWidth;
            const compositeWidth = resolvedContainerWidth;
            const headerHeight = header ? headerContentHeight + 12 : 0;
            const pdfPageWidth = compositeWidth;
            const pdfPageHeight = pdfPageWidth * pdfRatio;
            const pdfScale = pdfPageWidth / originalWidth;
            const compositeHeight = headerHeight + pdfPageHeight;
            const pageStrokes = allStrokes.filter((stroke) =>
              getStrokePageNumber(stroke) === pageNumber && isRenderableStroke(stroke)
            );
            const pageAnnotation = React.isValidElement(annotation)
              ? React.cloneElement(annotation as React.ReactElement<AnnotationCanvasProps>, {
                key: `annotation-${pageNumber}`,
                pageNumber,
                strokes: pageStrokes,
                onChange: (nextStrokes) => handlePageStrokeChange(pageNumber, nextStrokes),
                tool: tool === "hand" ? "pen" : tool,
                penColor,
                penThickness,
                eraserThickness,
                onActivatePage: setActivePage,
              })
              : annotation;

            return (
              <div
                key={`${documentTitle}-${pageNumber}`}
                className={styles.compositePage}
                data-page-number={pageNumber}
                style={{
                  width: compositeWidth,
                  height: compositeHeight,
                }}
              >
                <div ref={headerAreaRef} className={styles.headerArea} style={{ height: headerHeight }}>
                  {header ?? null}
                </div>

                <div className={styles.pdfContentArea} style={{ height: pdfPageHeight }}>
                  <div className={styles.pdfPage} style={{ width: pdfPageWidth, height: pdfPageHeight }}>
                    <Page
                      pageNumber={pageNumber}
                      width={pdfPageWidth}
                      className={styles.pageCanvas}
                      onLoadSuccess={(page) => handlePageLoadSuccess(pageNumber, page)}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    {annotation ? (
                      <div className={`${styles.annotationLayer} ${tool === "hand" ? styles.annotationLayerHand : ""}`}>
                        {pageAnnotation}
                      </div>
                    ) : null}
                    {renderAnnotations?.(pageNumber, pdfScale, pdfPageWidth, pdfPageHeight)}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </Document>
      </div>
    </div>
  );
}

function getStrokePageNumber(stroke: AnnotationStroke | null | undefined) {
  return stroke && Number.isInteger(stroke.pageNumber) && (stroke.pageNumber ?? 0) > 0 ? stroke.pageNumber : 1;
}

function isRenderableStroke(stroke: AnnotationStroke | null | undefined) {
  return Boolean(stroke && Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.every((point) =>
    point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  ));
}

export default PdfStage;
