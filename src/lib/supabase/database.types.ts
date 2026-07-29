export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: Database["public"]["Enums"]["app_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string;
          status: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          description?: string;
          status?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          description?: string;
          status?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      course_instructors: {
        Row: {
          course_id: string;
          instructor_id: string;
          assigned_by: string | null;
          assigned_at: string;
        };
        Insert: {
          course_id: string;
          instructor_id: string;
          assigned_by?: string | null;
          assigned_at?: string;
        };
        Update: {
          course_id?: string;
          instructor_id?: string;
          assigned_by?: string | null;
          assigned_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_instructors_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_instructors_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_instructors_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chapters: {
        Row: {
          id: string;
          course_id: string;
          position: number;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          position: number;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          position?: number;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          id: string;
          chapter_id: string;
          content: string;
          explanation: string;
          difficulty: number;
          status: string;
          source_number: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          content: string;
          explanation?: string;
          difficulty?: number;
          status?: string;
          source_number?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          content?: string;
          explanation?: string;
          difficulty?: number;
          status?: string;
          source_number?: number | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      question_options: {
        Row: {
          id: string;
          question_id: string;
          label: string;
          content: string;
          is_correct: boolean;
        };
        Insert: {
          id?: string;
          question_id: string;
          label: string;
          content: string;
          is_correct?: boolean;
        };
        Update: {
          id?: string;
          question_id?: string;
          label?: string;
          content?: string;
          is_correct?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_configs: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          kind: Database["public"]["Enums"]["attempt_kind"];
          question_count: number;
          duration_seconds: number;
          passing_score: number;
          shuffle_questions: boolean;
          shuffle_options: boolean;
          settings: Json;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          title: string;
          kind?: Database["public"]["Enums"]["attempt_kind"];
          question_count: number;
          duration_seconds: number;
          passing_score?: number;
          shuffle_questions?: boolean;
          shuffle_options?: boolean;
          settings?: Json;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          kind?: Database["public"]["Enums"]["attempt_kind"];
          question_count?: number;
          duration_seconds?: number;
          passing_score?: number;
          shuffle_questions?: boolean;
          shuffle_options?: boolean;
          settings?: Json;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_configs_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_configs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attempts: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          exam_config_id: string | null;
          kind: Database["public"]["Enums"]["attempt_kind"];
          status: Database["public"]["Enums"]["attempt_status"];
          started_at: string;
          expires_at: string;
          submitted_at: string | null;
          score: number | null;
          duration_seconds: number | null;
          question_order: Json;
          option_order: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          course_id: string;
          exam_config_id?: string | null;
          kind: Database["public"]["Enums"]["attempt_kind"];
          status?: Database["public"]["Enums"]["attempt_status"];
          started_at?: string;
          expires_at: string;
          submitted_at?: string | null;
          score?: number | null;
          duration_seconds?: number | null;
          question_order?: Json;
          option_order?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          exam_config_id?: string | null;
          kind?: Database["public"]["Enums"]["attempt_kind"];
          status?: Database["public"]["Enums"]["attempt_status"];
          started_at?: string;
          expires_at?: string;
          submitted_at?: string | null;
          score?: number | null;
          duration_seconds?: number | null;
          question_order?: Json;
          option_order?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_exam_config_id_fkey";
            columns: ["exam_config_id"];
            isOneToOne: false;
            referencedRelation: "exam_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_questions: {
        Row: {
          id: string;
          attempt_id: string;
          question_id: string;
          position: number;
          question_snapshot: Json;
          option_order: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          question_id: string;
          position: number;
          question_snapshot: Json;
          option_order: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          question_id?: string;
          position?: number;
          question_snapshot?: Json;
          option_order?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_questions_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_question_secrets: {
        Row: {
          attempt_question_id: string;
          correct_option_id: string;
          explanation: string;
        };
        Insert: {
          attempt_question_id: string;
          correct_option_id: string;
          explanation: string;
        };
        Update: {
          attempt_question_id?: string;
          correct_option_id?: string;
          explanation?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_question_secrets_attempt_question_id_fkey";
            columns: ["attempt_question_id"];
            isOneToOne: true;
            referencedRelation: "attempt_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_question_secrets_correct_option_id_fkey";
            columns: ["correct_option_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_answers: {
        Row: {
          id: string;
          attempt_question_id: string;
          selected_option_id: string | null;
          is_correct: boolean | null;
          is_flagged: boolean;
          answered_at: string;
        };
        Insert: {
          id?: string;
          attempt_question_id: string;
          selected_option_id?: string | null;
          is_correct?: boolean | null;
          is_flagged?: boolean;
          answered_at?: string;
        };
        Update: {
          id?: string;
          attempt_question_id?: string;
          selected_option_id?: string | null;
          is_correct?: boolean | null;
          is_flagged?: boolean;
          answered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_question_id_fkey";
            columns: ["attempt_question_id"];
            isOneToOne: true;
            referencedRelation: "attempt_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_selected_option_id_fkey";
            columns: ["selected_option_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          id: string;
          course_id: string;
          uploaded_by: string;
          file_name: string;
          status: string;
          total_rows: number;
          processed_rows: number;
          failed_rows: number;
          errors: Json;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          course_id: string;
          uploaded_by: string;
          file_name: string;
          status?: string;
          total_rows?: number;
          processed_rows?: number;
          failed_rows?: number;
          errors?: Json;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          course_id?: string;
          uploaded_by?: string;
          file_name?: string;
          status?: string;
          total_rows?: number;
          processed_rows?: number;
          failed_rows?: number;
          errors?: Json;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      can_manage_course: {
        Args: { target_course_id: string };
        Returns: boolean;
      };
      current_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_attempt_results: {
        Args: { target_attempt_id: string };
        Returns: {
          attempt_question_id: string;
          question_id: string;
          selected_option_id: string | null;
          is_correct: boolean | null;
          answered_at: string | null;
        }[];
      };
      get_submitted_practice_progress: {
        Args: { target_course_id: string };
        Returns: {
          attempt_id: string;
          chapter_id: string;
          correct_count: number;
          total_count: number;
          submitted_at: string;
        }[];
      };
      is_course_instructor: {
        Args: { target_course_id: string };
        Returns: boolean;
      };
      start_attempt: {
        Args: {
          target_course_id: string;
          target_exam_config_id?: string | null;
          target_chapter_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["attempts"]["Row"];
      };
      save_practice_answer: {
        Args: {
          target_attempt_id: string;
          target_attempt_question_id: string;
          target_option_id: string;
        };
        Returns: {
          selected_option_id: string;
          is_correct: boolean;
          explanation: string;
          was_already_locked: boolean;
        }[];
      };
      sync_practice_attempt: {
        Args: { target_attempt_id: string };
        Returns: Database["public"]["Tables"]["attempts"]["Row"];
      };
      load_practice_attempt_questions: {
        Args: {
          target_attempt_id: string;
          target_chapter_id: string;
        };
        Returns: Database["public"]["Tables"]["attempt_questions"]["Row"][];
      };
      set_practice_flag: {
        Args: {
          target_attempt_id: string;
          target_attempt_question_id: string;
          target_flagged: boolean;
        };
        Returns: undefined;
      };
      finish_practice_attempt: {
        Args: { target_attempt_id: string };
        Returns: Database["public"]["Tables"]["attempts"]["Row"];
      };
      write_audit_log: {
        Args: {
          audit_action: string;
          audit_entity_type: string;
          audit_entity_id?: string | null;
          audit_old_data?: Json | null;
          audit_new_data?: Json | null;
          audit_metadata?: Json;
        };
        Returns: number;
      };
    };
    Enums: {
      app_role: "admin" | "instructor" | "student";
      attempt_kind: "practice" | "mock_exam";
      attempt_status: "in_progress" | "submitted" | "expired";
    };
    CompositeTypes: Record<string, never>;
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "instructor", "student"],
      attempt_kind: ["practice", "mock_exam"],
      attempt_status: ["in_progress", "submitted", "expired"],
    },
  },
} as const;
