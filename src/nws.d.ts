export interface NWSAlert {
    id: string;
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][];
    };
    properties: {
      '@id': string;
      '@type': string;
      areaDesc: string;
      effective: string;
      expires: string;
      sent: string;
      ends: string;
      status: string;
      messageType: string;
      category: string;
      severity: string;
      certainty: string;
      urgency: string;
      event: string;
      sender: string;
      senderName: string;
      headline: string;
      description: string;
      instruction: string;
      web: string;
      geocode: {
        UGC: string[];
      }
      parameters: {
        AWIPSidentifier: string[];
        WMOidentifier: string[];
        PIL: string[];
      };
    };
  }
  
export interface NWSAlertGeoJSON {
    type: 'FeatureCollection';
    features: NWSAlert[];
  }