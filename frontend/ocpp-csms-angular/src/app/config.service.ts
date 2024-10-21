import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private apiUrl: string = 'http://37.27.179.61/:4000';

  getApiUrl(): string {
    return this.apiUrl;
  }

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }
}
