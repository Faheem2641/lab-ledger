declare module 'html2pdf.js' {
  interface Html2Pdf {
    set(options: any): Html2Pdf;
    from(element: HTMLElement | null): Html2Pdf;
    save(): Promise<void>;
    output(type?: string, options?: any): Promise<any>;
  }
  function html2pdf(): Html2Pdf;
  export default html2pdf;
}
