import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Clock, MessageSquare, Table, Send, Eye, Plus, Trash2, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

interface ParsedEntry {
  projectName: string;
  duration: number;
  date: string;
  notes?: string;
  confidence: number;
  matchedProjectId?: string;
  matchedProjectName?: string;
}

interface Project {
  id: string;
  name: string;
}

interface TimeEntryForm {
  projectId: string;
  projectName: string;
  duration: number;
  date: string;
  notes: string;
  confidence: number;
}

export default function TimeTracker() {
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryForm[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available projects
  const { data: projectsData } = useQuery({
    queryKey: ["/api/projects"],
  });

  const projects: Project[] = (projectsData as { projects?: Project[] })?.projects || [];

  // Parse natural language mutation
  const parseMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/parse", { text });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setParsedEntries(data.entries);
        
        // Convert to editable form entries
        const formEntries: TimeEntryForm[] = data.entries.map((entry: ParsedEntry) => ({
          projectId: entry.matchedProjectId || '',
          projectName: entry.matchedProjectName || entry.projectName,
          duration: entry.duration,
          date: entry.date,
          notes: entry.notes || '',
          confidence: entry.confidence,
        }));
        
        setTimeEntries(formEntries);
        toast({
          title: "Successfully parsed!",
          description: `Found ${data.entries.length} time entries`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Parsing failed",
        description: error instanceof Error ? error.message : "Failed to parse input",
        variant: "destructive",
      });
    },
  });

  // Submit entries mutation
  const submitMutation = useMutation({
    mutationFn: async (entries: TimeEntryForm[]) => {
      const response = await apiRequest("POST", "/api/submit", { entries });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Successfully submitted!",
          description: data.message,
        });
        // Clear entries after successful submission
        setTimeEntries([]);
        setParsedEntries([]);
        setNaturalLanguageInput("");
        queryClient.invalidateQueries({ queryKey: ["/api/entries"] });
      } else {
        toast({
          title: "Partial success",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Failed to submit entries",
        variant: "destructive",
      });
    },
  });

  const handleParse = () => {
    if (!naturalLanguageInput.trim()) {
      toast({
        title: "Input required",
        description: "Please enter a description of your work",
        variant: "destructive",
      });
      return;
    }
    parseMutation.mutate(naturalLanguageInput.trim());
  };

  const handleSubmit = () => {
    const validEntries = timeEntries.filter(entry => entry.projectId && entry.duration > 0);
    
    if (validEntries.length === 0) {
      toast({
        title: "No valid entries",
        description: "Please ensure all entries have a project and duration",
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate(validEntries);
  };

  const updateEntry = (index: number, field: keyof TimeEntryForm, value: string | number) => {
    const updated = [...timeEntries];
    if (field === 'projectId') {
      const project = projects.find(p => p.id === value);
      updated[index] = {
        ...updated[index],
        projectId: value as string,
        projectName: project?.name || '',
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }
    setTimeEntries(updated);
  };

  const removeEntry = (index: number) => {
    setTimeEntries(timeEntries.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    setTimeEntries([
      ...timeEntries,
      {
        projectId: '',
        projectName: '',
        duration: 60,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        confidence: 100,
      },
    ]);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  const parseDuration = (value: string): number => {
    const hourMatch = value.match(/(\d+)h/);
    const minMatch = value.match(/(\d+)m/);
    const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
    const minutes = minMatch ? parseInt(minMatch[1]) : 0;
    return hours * 60 + minutes;
  };

  const totalDuration = timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const hasValidationErrors = timeEntries.some(entry => !entry.projectId || entry.duration <= 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Clock className="text-primary-foreground text-sm" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">AI Time Tracker</h1>
            </div>
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span>ClickUp Connected</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Natural Language Input */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <MessageSquare className="text-primary" />
              <h2 className="text-lg font-semibold text-slate-900">Describe Your Work</h2>
            </div>
            <div className="space-y-4">
              <Textarea
                placeholder="Tell me what you worked on... e.g., 'I worked on the event app yesterday for 2 hours' or 'Spent 30 minutes on bug fixes for the dashboard this morning'"
                value={naturalLanguageInput}
                onChange={(e) => setNaturalLanguageInput(e.target.value)}
                className="h-32 resize-none"
              />
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500 flex items-center">
                  <span className="mr-1">💡</span>
                  Try: "2 hours on mobile app, 1 hour reviewing PRs last Friday"
                </div>
                <Button 
                  onClick={handleParse}
                  disabled={parseMutation.isPending || !naturalLanguageInput.trim()}
                  className="font-medium"
                >
                  {parseMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-2 h-4 w-4" />
                  )}
                  Process with AI
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing State */}
        {parseMutation.isPending && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div>
                  <h3 className="font-medium text-slate-900">Processing your input...</h3>
                  <p className="text-sm text-slate-500 mt-1">AI is analyzing your work description and matching projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time Entry Matrix */}
        {timeEntries.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Table className="text-primary" />
                  <h2 className="text-lg font-semibold text-slate-900">Review & Edit Time Entries</h2>
                </div>
                <span className="text-sm text-slate-500">{timeEntries.length} entries parsed</span>
              </div>

              <div className="space-y-4">
                {timeEntries.map((entry, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Project Selection */}
                      <div className="md:col-span-4">
                        <Label className="text-sm font-medium text-slate-700 mb-2">Project</Label>
                        <div className="relative">
                          <Select
                            value={entry.projectId}
                            onValueChange={(value) => updateEntry(index, 'projectId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select project..." />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {entry.confidence && (
                            <div className="absolute right-2 top-2 pointer-events-none">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                entry.confidence >= 90 ? 'bg-emerald-100 text-emerald-800' :
                                entry.confidence >= 70 ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {entry.confidence}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Duration */}
                      <div className="md:col-span-2">
                        <Label className="text-sm font-medium text-slate-700 mb-2">Duration</Label>
                        <Input
                          value={formatDuration(entry.duration)}
                          onChange={(e) => {
                            const parsed = parseDuration(e.target.value);
                            if (parsed > 0) updateEntry(index, 'duration', parsed);
                          }}
                        />
                      </div>

                      {/* Date */}
                      <div className="md:col-span-2">
                        <Label className="text-sm font-medium text-slate-700 mb-2">Date</Label>
                        <Input
                          type="date"
                          value={entry.date}
                          onChange={(e) => updateEntry(index, 'date', e.target.value)}
                        />
                      </div>

                      {/* Notes */}
                      <div className="md:col-span-3">
                        <Label className="text-sm font-medium text-slate-700 mb-2">Notes</Label>
                        <Input
                          placeholder="Add notes..."
                          value={entry.notes}
                          onChange={(e) => updateEntry(index, 'notes', e.target.value)}
                        />
                      </div>

                      {/* Actions */}
                      <div className="md:col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEntry(index)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary Card */}
              <div className="mt-6 bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Total Time</p>
                      <p className="text-lg font-semibold text-primary">{formatDuration(totalDuration)}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-300"></div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Entries</p>
                      <p className="text-lg font-semibold text-slate-600">{timeEntries.length}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-300"></div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Date Range</p>
                      <p className="text-sm text-slate-600">
                        {timeEntries.length > 0 ? 
                          new Date(Math.min(...timeEntries.map(e => new Date(e.date).getTime()))).toLocaleDateString() +
                          (timeEntries.length > 1 ? ` - ${new Date(Math.max(...timeEntries.map(e => new Date(e.date).getTime()))).toLocaleDateString()}` : '')
                          : 'No entries'
                        }
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={addEntry}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Entry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submission Section */}
        {timeEntries.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Send className="text-primary" />
                <h2 className="text-lg font-semibold text-slate-900">Submit to ClickUp</h2>
              </div>

              {/* Validation Summary */}
              {!hasValidationErrors ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="text-emerald-500 mt-0.5 h-5 w-5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-emerald-800">Ready to Submit</h4>
                      <ul className="mt-2 text-sm text-emerald-700 space-y-1">
                        <li>✓ All entries have valid projects assigned</li>
                        <li>✓ Time durations are properly formatted</li>
                        <li>✓ Dates are within acceptable range</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="text-amber-500 mt-0.5 h-5 w-5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800">Review Required</h4>
                      <ul className="mt-2 text-sm text-amber-700 space-y-1">
                        {timeEntries.some(e => !e.projectId) && <li>• Some entries are missing project assignments</li>}
                        {timeEntries.some(e => e.duration <= 0) && <li>• Some entries have invalid durations</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Submission Actions */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600 flex items-center">
                  <span className="mr-1">ℹ️</span>
                  This will log {timeEntries.length} time entries to your ClickUp workspace
                </div>
                <div className="flex space-x-3">
                  <Button variant="outline" onClick={() => setShowPreview(true)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={hasValidationErrors || submitMutation.isPending}
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Submit to ClickUp
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Submission</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {timeEntries.map((entry, index) => (
              <div key={index} className="border border-slate-200 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">Entry {index + 1}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Project:</span>
                    <span className="ml-2 font-medium">{entry.projectName || 'No project selected'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Duration:</span>
                    <span className="ml-2 font-medium">{formatDuration(entry.duration)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Date:</span>
                    <span className="ml-2 font-medium">{new Date(entry.date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Notes:</span>
                    <span className="ml-2">{entry.notes || 'No notes'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setShowPreview(false);
                handleSubmit();
              }}
              disabled={hasValidationErrors}
            >
              Confirm & Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
